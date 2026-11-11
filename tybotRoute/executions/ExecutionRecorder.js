'use strict';

const os = require('os');
const winston = require('../utils/winston');
const { getConfig, isEnabled } = require('./config');
const { stripSecrets, isSecretName } = require('./secrets');
const Sealer = require('./Sealer');
const { getEmitter, buildEnvelope } = require('./TraceEmitter');
const StateDiff = require('./StateDiff');
const WriteTap = require('./WriteTap');
const { mapOutcome } = require('./OutcomeMapper');
const { detectTrigger } = require('./trigger');
const { rootIdOf } = require('./botIdentity');
const AbortRegistry = require('./AbortRegistry');
const Checkpointer = require('./Checkpointer');

const POLICY_TTL_MS = 60000;
const OUTCOME_RANK = { success: 0, failure_condition: 1, error: 2, interrupted: 3 };
// directives that pass ctx.signal to what they wait on (spec §7.1.6); any other one runs to
// completion on a hard stop (hard_degraded) and the chain stops before the next action
const ABORTABLE = new Set(['wait', 'webrequest', 'webrequestv2', 'gpt_task', 'ai_prompt', 'askgpt', 'askgptv2', 'ai_condition', 'send_whatsapp']);

let state = { store: null, apiEndpoint: null };
let policyCache = new Map();
const deferred = new Set();

function stopHeartbeat(ctx) {
  if (ctx && ctx._heartbeat) {
    clearInterval(ctx._heartbeat);
    ctx._heartbeat = null;
  }
}

/**
 * Every chain heartbeats while it runs, on a timer (never on the flow's await path; the timer does not keep
 * the process alive), with acquire-or-renew: a chain that lost the SET NX, or whose lease expired, takes the
 * key once it is free, so a running chain is never left without an owner. A Redis error (null) or a key held
 * by another pod's chain (false) does not stop the timer; only the chain's exit (releaseLease) does.
 */
function startHeartbeat(ctx) {
  stopHeartbeat(ctx);
  const timer = setInterval(() => {
    ctx._store.renewLease(ctx.execution_id, ctx.pod, ctx._cfg.leaseMs).then(() => {}, () => {});
  }, ctx._cfg.heartbeatMs);
  if (timer.unref) timer.unref();
  ctx._heartbeat = timer;
}

// chains of an execution running on this pod: the lease (one key per execution, value = pod) is given back
// only when the last of them exits, so a second chain is not left ownerless by the first one's release
const podChains = new Map();

function chainIn(ctx) {
  podChains.set(ctx.execution_id, (podChains.get(ctx.execution_id) || 0) + 1);
  ctx._counted = true;
}

/** true when this was the pod's last chain of the execution. Once per ctx. */
function chainOut(ctx) {
  if (!ctx._counted) return false;
  ctx._counted = false;
  const n = (podChains.get(ctx.execution_id) || 1) - 1;
  if (n <= 0) {
    podChains.delete(ctx.execution_id);
    return true;
  }
  podChains.set(ctx.execution_id, n);
  return false;
}

function warn(op, err) {
  winston.warn('(ExecutionRecorder) ' + op + ' failed: ' + (err && err.message));
}

function parametersKey(requestId) {
  // lazy: TiledeskChatbot requires this module
  const { TiledeskChatbot } = require('../engine/TiledeskChatbot');
  return TiledeskChatbot.requestCacheKey(requestId) + ':parameters';
}

/** Raw :parameters hash (strings, as stored). Null on a Redis error. */
async function readState(ctx) {
  try {
    return (await ctx._store.client.hGetAll(parametersKey(ctx.request_id))) || {};
  } catch (err) {
    warn('HGETALL', err);
    return null;
  }
}

/** capture_data of the project, cached 60 s in memory. Absent → true. */
async function captureData(store, idProject) {
  const hit = policyCache.get(idProject);
  if (hit && Date.now() - hit.at < POLICY_TTL_MS) return hit.value;
  let value = true;
  try {
    value = (await store.client.hGet(`exec:policy:${idProject}`, 'capture_data')) !== 'false';
  } catch (err) {
    warn('policy read', err);
  }
  policyCache.set(idProject, { value, at: Date.now() });
  return value;
}

/** p, but settled within ms at the latest (resolved, with a warning, on timeout). Rejections pass through. */
function withinBudget(p, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      warn('beforeJump', new Error('block exit not recorded within ' + ms + ' ms, posting the jump anyway'));
      resolve();
    }, ms);
    if (timer.unref) timer.unref();
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Runs job off the flow path (next macrotask). Never throws. */
function defer(job) {
  const p = new Promise((resolve) => setImmediate(() => {
    try {
      job();
    } catch (err) {
      warn('deferred trace work', err);
    }
    resolve();
  }));
  deferred.add(p);
  p.then(() => deferred.delete(p));
}

/**
 * Allocates the next seq (awaited: the only Redis call of an event) and returns it.
 * build(seq) — diffing, hashing, sealing — and the publish run deferred, in seq order.
 * seqP: a nextSeq the caller already issued together with its other Redis call (one round trip).
 */
async function emit(ctx, type, build, seqP) {
  const seq = await (seqP || ctx._store.nextSeq(ctx.execution_id));
  if (seq === null || seq === undefined) return null;
  const at = new Date().toISOString();
  defer(() => {
    const envelope = buildEnvelope({ ctx, seq, type, data: build(seq) });
    envelope.at = at;
    getEmitter().emit(envelope);
  });
  return seq;
}

/** Seals plain into data[field] when capture is on and there is something to seal. */
function sealInto(ctx, data, field, plain) {
  if (!ctx._captureData || plain === undefined || plain === null) return;
  if (typeof plain === 'object' && Object.keys(plain).length === 0) return;
  try {
    const sealed = Sealer.seal(plain, ctx._cfg);
    // no key, or over dataMaxBytes: no sealed block; the clear part of the event stays
    if (sealed && sealed !== Sealer.TOO_LARGE) data[field] = sealed;
    else data.data_missing = true;
  } catch (err) {
    warn('seal ' + field, err);
  }
}

/** The whole state minus secrets and oversized values (what a keyframe seals). */
function sealableState(raw, valueMaxBytes) {
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (isSecretName(key)) continue;
    if (Buffer.byteLength(String(value), 'utf8') > valueMaxBytes) continue;
    out[key] = value;
  }
  return out;
}

function countChanged(before, after) {
  const b = before || {};
  const a = after || {};
  let n = 0;
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (b[key] !== a[key]) n++;
  }
  return n;
}

function actionRecord(ctx, index) {
  return ctx.step.actions.find((a) => a.index === index);
}

function isAutomation(ctx) {
  return typeof ctx.request_id === 'string' && ctx.request_id.startsWith('automation-request-');
}

/** execution.stopped, once per chain. */
async function emitStopped(ctx, mode, interruptedAction) {
  if (ctx._stoppedEmitted) return null;
  ctx._stoppedEmitted = true;
  return emit(ctx, 'execution.stopped', (seq) => {
    const data = { mode };
    if (interruptedAction) data.interrupted_action = interruptedAction;
    data.last_seq = seq;
    return data;
  });
}

function isAbortable(directive) {
  return !!(directive && typeof directive.name === 'string' && ABORTABLE.has(directive.name.toLowerCase()));
}

/**
 * The abort listener (AbortRegistry, fired by the ControlListener). Synchronous part first, so it
 * runs before any directive's own abort listener: ctx.aborted, and the action in flight marked
 * interrupted (abortable) or hard_degraded (not). An interrupted action is recorded and the chain
 * stopped right away, whatever its directive does next; a degraded one stops after it completes.
 */
function onAbort(ctx) {
  ctx.aborted = true;
  if (ctx._failed || ctx._stopped || ctx.jumpInFlight || !ctx.step) return;
  const rec = ctx.step.actions[ctx.step.actions.length - 1];
  if (!rec || rec.pending) return; // between actions: the next gate stops the chain
  if (!isAbortable(rec.directive)) {
    rec.hardDegraded = true;
    return;
  }
  rec.interrupted = true;
  ctx._interrupted = rec;
  ctx._stopped = true; // now: a rejection of the aborted action must not reach endOfChain (idle) before stopHard runs
  ExecutionRecorder.afterAction(ctx, { index: rec.index, directive: rec.directive })
    .then(() => ExecutionRecorder.stopHard(ctx), (err) => warn('onAbort', err));
}

/** Automation sync caller (index.js /block): the 409 on its /webhooks topic, once per chain. Never throws. */
async function publishStopped(ctx) {
  if (!isAutomation(ctx) || ctx._stopPublished) return;
  ctx._stopPublished = true;
  try {
    const webResponse = { status: 409, payload: { error: 'execution_stopped', execution_id: ctx.execution_id } };
    await ctx._store.client.publish(`/webhooks/${ctx.request_id}`, JSON.stringify(webResponse));
  } catch (err) {
    warn('publish 409', err);
  }
}

const ExecutionRecorder = {

  /** Called by startApp once Redis is connected. */
  init({ store, apiEndpoint } = {}) {
    state.store = store || null;
    if (apiEndpoint !== undefined) state.apiEndpoint = apiEndpoint || null;
  },

  _resetForTests() {
    state = { store: null, apiEndpoint: null };
    policyCache = new Map();
  },

  /** Resolves once every deferred event build and publish has run. */
  async _drainForTests() {
    while (deferred.size > 0 || Checkpointer._pending.size > 0) {
      await Promise.all([...deferred]);
      await Checkpointer.drain();
    }
  },

  async onMessageIn({ message, bot, botId, requestId, projectId, token, store } = {}) {
    if (!isEnabled()) return null;
    let ctx = null;
    try {
      const st = store || state.store;
      if (!st) return null;
      const cfg = getConfig();
      const rootId = rootIdOf(bot);
      const agentId = rootId || botId;
      const agentName = (bot && bot.name) || null;
      const test = !rootId;
      const trigger = detectTrigger(message, requestId, botId, agentId);
      const resolved = await st.resolve({
        requestId,
        agentId,
        hintedExecutionId: message && message.attributes && message.attributes.execution_id,
        meta: { id_project: projectId, agent_version: botId, agent_name: agentName, test, trigger },
        withState: cfg.stateEnabled
      });
      if (!resolved) return null;

      ctx = {
        execution_id: resolved.executionId,
        id_project: projectId,
        agent_id: agentId,
        agent_version: botId,
        agent_name: agentName,
        request_id: requestId,
        test,
        trigger,
        step: null,
        current: null,
        prev: null,
        scopes: { message_in: new Set(), jump_params: new Set() },
        kf: { blocks_since: 0, delta_bytes: 0 },
        jumpInFlight: false,
        _store: st,
        _cfg: cfg,
        _projectKey: Sealer.projectHashKey(projectId, cfg.hashKey),
        pod: os.hostname(),
        leased: false,
        _heartbeat: null,
        _captureData: true,
        _hasState: false,
        _blocks: 0,
        _failed: false,
        _chainEnded: false,
        _cp: Checkpointer.emptyContext(), // stacks and locks for the checkpoint, read at block entry
        created: !!resolved.created
      };

      // one tick, one connection: the policy and the saved state (resolve tail), the lease, and on a jump the
      // transit DEL (a further exec:* read for this message is one more line in this array)
      const hinted = message && message.attributes && message.attributes.execution_id;
      const needState = cfg.stateEnabled && resolved.state === undefined;
      const [capture, savedState, leased, , stop] = await Promise.all([
        captureData(st, projectId),
        needState ? st.getState(ctx.execution_id) : null,
        st.acquireLease(ctx.execution_id, ctx.pod, cfg.leaseMs),
        hinted ? st.clearTransit(ctx.execution_id) : null,
        st.getStop(ctx.execution_id)
      ]);
      ctx._captureData = capture;
      ctx._stopAtStart = stop || null; // read by gateMessage
      // a lost NX (another chain of this execution is running): the message still runs, and its
      // heartbeat takes the lease once the other chain gives it back
      ctx.leased = leased === true;
      chainIn(ctx);
      startHeartbeat(ctx);
      // resolve read the state with the status (a created execution has none)
      let saved = null;
      if (cfg.stateEnabled) saved = resolved.state !== undefined ? resolved.state : savedState;
      if (saved) {
        ctx._hasState = true;
        ctx.prev = saved.raw || null;
        ctx.kf.blocks_since = Number(saved.blocks_since_kf) || 0;
        ctx.kf.delta_bytes = Number(saved.delta_bytes_since_kf) || 0;
      }

      if (resolved.created) {
        const data = { trigger, agent_name: agentName, test };
        if (resolved.parentExecutionId) data.parent_execution_id = resolved.parentExecutionId;
        if (resolved.previousExecutionId) data.previous_execution_id = resolved.previousExecutionId;
        const request = (message && message.request) || {};
        const payload = (request.attributes && request.attributes.payload) || (message && message.attributes && message.attributes.payload);
        // a copy now (the flow may change the payload later); the sealing is deferred
        const plain = payload !== undefined && payload !== null ? stripSecrets(payload) : null;
        await emit(ctx, 'execution.started', () => {
          sealInto(ctx, data, 'sealed_trigger_payload', plain);
          return data;
        });
        if (!isAutomation(ctx)) writeExecutionId(ctx, token);
      }
      // hard stop: this chain's controller, released with the lease at every chain exit
      const ac = AbortRegistry.register(ctx.execution_id);
      ctx._abort = ac;
      ctx.signal = ac.signal;
      ctx.aborted = false;
      ac.signal.addEventListener('abort', () => {
        try {
          onAbort(ctx);
        } catch (err) {
          warn('onAbort', err);
        }
      }, { once: true });
      return ctx;
    } catch (err) {
      warn('onMessageIn', err);
      if (ctx) await ExecutionRecorder.releaseLease(ctx); // no heartbeat or chain count left behind
      return null;
    }
  },

  /** Runs fn with the writes it makes labelled as `name` (message_in | jump_params). */
  withScope(ctx, name, fn) {
    if (!ctx) return fn();
    return WriteTap.runScope(name, ctx.request_id, async () => {
      const store = WriteTap.current();
      try {
        return await fn();
      } finally {
        try {
          for (const key of store.writes.keys()) ctx.scopes[name].add(key);
        } catch (err) {
          warn('withScope', err);
        }
      }
    });
  },

  /**
   * actions: the block's actions (the checkpoint's next_action_type); the directives run later can
   * replace the names (setDirectives). Writes the checkpoint at action 0 of this block (fire-and-forget).
   */
  async blockEntry(ctx, { blockId, blockName, actions } = {}) {
    if (!ctx) return null;
    try {
      const seq = await enterBlock(ctx, { blockId, blockName });
      if (ctx.step) {
        ctx.step.directive_names = Checkpointer.directiveNames(actions);
        Checkpointer.writeAt(ctx, ctx.step, { action_index: 0, next_action: 'run', seq });
      }
      return seq;
    } catch (err) {
      warn('blockEntry', err);
      return null;
    }
  },

  /** The directives DirectivesChatbotPlug runs for the open step: their names become next_action_type. Never throws. */
  setDirectives(ctx, directives) {
    try {
      if (ctx && ctx.step && Array.isArray(directives)) ctx.step.directive_names = directives.map((d) => (d && d.name) || null);
    } catch (err) {
      warn('setDirectives', err);
    }
  },

  /** Runs one action's execute call with the write tap; a throw or rejection is recorded as `error`. */
  runAction(ctx, { index, directive } = {}, fn) {
    if (!ctx || !ctx.step || ctx._failed) return fn();
    let tapOptions;
    let rec;
    try {
      const step = ctx.step;
      rec = { index, directive, startedAt: Date.now(), jumpedTo: undefined, pending: null, tap: null, outcome: null, exit_taken: null };
      step.actions.push(rec);
      const actionId = directive && directive.action ? directive.action._tdActionId : undefined;
      tapOptions = {
        executionId: ctx.execution_id,
        stepSeq: step.seq,
        actionIndex: index,
        actionId,
        requestId: ctx.request_id,
        isAborted: () => ctx.aborted === true,
        // called before a block jump is posted (Task 8): the block's exit is recorded first
        onJump: async (target) => {
          try {
            rec.jumpedTo = target;
            // set first: the action's own callback can reach theend while the exit is being recorded
            ctx.jumpInFlight = true;
            await ExecutionRecorder.afterAction(ctx, { index, directive });
            await ExecutionRecorder.blockExit(ctx);
          } catch (err) {
            warn('onJump', err);
          } finally {
            // also when recording threw: the next block may run on any pod, so mark the hand-over (setTransit
            // never throws), then let go of the lease (endOfChain no-ops after a jump)
            await ctx._store.setTransit(ctx.execution_id, ctx._cfg.transitMs);
            await ExecutionRecorder.releaseLease(ctx);
          }
        }
      };
    } catch (err) {
      warn('runAction', err);
      return fn();
    }
    const onError = (error) => (async () => {
      await ExecutionRecorder.afterAction(ctx, { index, directive, error });
      await ExecutionRecorder.blockExit(ctx);
      await ExecutionRecorder.endOfChain(ctx);
    })();
    let ret;
    try {
      ret = WriteTap.runAction(tapOptions, () => {
        rec.tap = WriteTap.current();
        return fn();
      });
    } catch (err) {
      onError(err);
      throw err;
    }
    if (ret && typeof ret.then === 'function') {
      return ret.then(undefined, (err) => onError(err).then(() => { throw err; }));
    }
    return ret;
  },

  /** Idempotent per index: a second call waits for the first one's record. */
  afterAction(ctx, args = {}) {
    if (!ctx || !ctx.step || ctx._failed) return Promise.resolve(null);
    try {
      let rec = actionRecord(ctx, args.index);
      if (!rec) {
        rec = { index: args.index, startedAt: args.startedAt || Date.now(), jumpedTo: undefined, pending: null, tap: null };
        ctx.step.actions.push(rec);
      }
      if (!rec.pending) rec.pending = recordAction(ctx, ctx.step, rec, args);
      return rec.pending;
    } catch (err) {
      warn('afterAction', err);
      return Promise.resolve(null);
    }
  },

  /** Idempotent per step: a second call waits for the first one's record. */
  blockExit(ctx) {
    if (!ctx || !ctx.step) return Promise.resolve(null);
    if (!ctx.step.exitPending) ctx.step.exitPending = recordBlockExit(ctx, ctx.step);
    return ctx.step.exitPending;
  },

  /**
   * Before anything runs for a message (index.js /ext). Stop flag set: a jump emits execution.stopped
   * (once per chain), a user message execution.message_while_stopped; the lease is released and an
   * automation sync caller gets its 409. Returns 'blocked' then, 'run' otherwise (and for a null ctx).
   */
  async gateMessage(ctx, message) {
    if (!ctx) return 'run';
    let mode;
    try {
      mode = ctx._stopAtStart !== undefined ? ctx._stopAtStart : await ctx._store.getStop(ctx.execution_id);
    } catch (err) {
      warn('gateMessage', err);
      return 'run';
    }
    if (!mode) return 'run';
    ctx._stopped = true;
    try {
      await ExecutionRecorder.releaseLease(ctx);
      if (message && message.sender === '_tdinternal') await emitStopped(ctx, mode);
      else await emit(ctx, 'execution.message_while_stopped', () => ({}));
      await publishStopped(ctx);
    } catch (err) {
      warn('gateMessage', err);
    }
    return 'blocked';
  },

  /**
   * Before each action (DirectivesChatbotPlug.nextDirective): one GET of the stop flag. Set: the block
   * exit is recorded (outcome unchanged), execution.stopped emitted, the lease released, an automation
   * sync caller gets its 409, and the chain ends with nothing more (ctx._stopped). true = stop here.
   */
  async checkStopBeforeAction(ctx, { index, directive } = {}) {
    if (!ctx || ctx._failed) return false;
    if (ctx.aborted) { // hard stop seen on this pod: no GET needed
      await ExecutionRecorder.stopHard(ctx);
      return true;
    }
    if (ctx._stopped) return true;
    let mode;
    try {
      mode = await ctx._store.getStop(ctx.execution_id);
    } catch (err) {
      warn('checkStopBeforeAction', err);
      return false;
    }
    if (!mode) return false;
    ctx._stopped = true;
    // a jump already left this block (exit recorded, lease released): the next /ext emits stopped
    if (ctx.jumpInFlight) return true;
    try {
      await ExecutionRecorder.blockExit(ctx);
      await ExecutionRecorder.releaseLease(ctx);
      const seq = await emitStopped(ctx, mode);
      // action k did not start: resume runs it (fire-and-forget write, then the sealed park)
      Checkpointer.writeAt(ctx, ctx.step, { action_index: index, next_action: 'run', seq });
      Checkpointer.park(ctx);
      await publishStopped(ctx);
    } catch (err) {
      warn('checkStopBeforeAction', err);
    }
    return true;
  },

  /**
   * The chain's end on a hard stop (ctx.aborted), once: the block exit (an interrupted action makes
   * the step outcome interrupted), the lease, execution.stopped {mode:'hard', interrupted_action?}
   * (shared once-guard with the soft stop) and the automation 409. Nothing runs after it
   * (ctx._stopped: no idle/ended/failed). Never throws.
   */
  stopHard(ctx) {
    if (!ctx) return Promise.resolve();
    if (!ctx._hardStop) {
      ctx._hardStop = (async () => {
        if (ctx._failed) return;
        ctx._stopped = true;
        // a jump already left this block (exit recorded, lease released): the next pod's gate emits stopped
        if (ctx.jumpInFlight) return;
        try {
          await ExecutionRecorder.blockExit(ctx);
          await ExecutionRecorder.releaseLease(ctx);
          const rec = ctx._interrupted;
          const action = (rec && rec.directive && rec.directive.action) || {};
          const seq = await emitStopped(ctx, 'hard', rec ? {
            index: rec.index,
            action_id: action._tdActionId === undefined ? null : action._tdActionId,
            type: rec.directive ? rec.directive.name : null,
            title: action._tdActionTitle === undefined ? null : action._tdActionTitle
          } : undefined);
          // the interrupted action k is run again on resume; without one, the after-action write stands
          if (rec) Checkpointer.writeAt(ctx, ctx.step, { action_index: rec.index, next_action: 'rerun', seq });
          Checkpointer.park(ctx);
          await publishStopped(ctx);
        } catch (err) {
          warn('stopHard', err);
        }
      })();
    }
    return ctx._hardStop;
  },

  /**
   * Stops the heartbeat, drops the abort controller and, when this is the pod's last running chain of the
   * execution, gives the lease back (compare-and-delete on the pod id). Never throws.
   */
  async releaseLease(ctx) {
    if (!ctx) return;
    try {
      if (ctx._abort) AbortRegistry.release(ctx.execution_id, ctx._abort);
      stopHeartbeat(ctx);
      ctx.leased = false;
      if (chainOut(ctx)) await ctx._store.releaseLease(ctx.execution_id, ctx.pod);
    } catch (err) {
      warn('releaseLease', err);
    }
  },

  /**
   * A chain exit where no block ran (no reply, an error before the directives). An execution this
   * message created ends like any chain that did not jump (idle, or ended completed for an automation),
   * so it is never left running without an owner; otherwise only the lease goes. Never throws.
   */
  async endWithoutChain(ctx) {
    if (!ctx) return;
    if (ctx.created && !ctx.step) await ExecutionRecorder.endOfChain(ctx);
    await ExecutionRecorder.releaseLease(ctx);
  },

  async endOfChain(ctx) {
    if (!ctx || ctx.jumpInFlight || ctx._failed || ctx._chainEnded || ctx._stopped) return null;
    try {
      ctx._chainEnded = true;
      await ExecutionRecorder.releaseLease(ctx);
      if (isAutomation(ctx)) {
        const seq = await emit(ctx, 'execution.ended', () => ({ end_reason: 'completed' }));
        await ctx._store.setStatusHint(ctx.execution_id, 'completed');
        return seq;
      }
      const seq = await emit(ctx, 'execution.idle', (seq) => ({ last_seq: seq }));
      Checkpointer.park(ctx);
      return seq;
    } catch (err) {
      warn('endOfChain', err);
      return null;
    }
  },

  /** action_index: the action that did not run (a limit hit before it): the checkpoint points at it. */
  async failed(ctx, { error_code, message, action_index } = {}) {
    if (!ctx || ctx._failed || ctx._stopped) return null;
    try {
      ctx._failed = true;
      await ExecutionRecorder.releaseLease(ctx);
      const data = { error_code, message };
      if (ctx.step && ctx.step.seq !== null) data.step_seq = ctx.step.seq;
      const seq = await emit(ctx, 'execution.failed', () => data);
      if (Number.isInteger(action_index)) Checkpointer.writeAt(ctx, ctx.step, { action_index, next_action: 'run', seq });
      Checkpointer.park(ctx);
      await ctx._store.setStatusHint(ctx.execution_id, 'failed');
      return seq;
    } catch (err) {
      warn('failed', err);
      return null;
    }
  },

  /**
   * Called by TilebotService.sendMessageToBot before a block jump is posted.
   * Outside a traced action: undefined, synchronously, and the message is untouched.
   * In one: onJump runs synchronously (it marks the jump before the action's own callback can
   * reach theend), execution_id goes into the message attributes, and the returned promise
   * resolves once the block exit is recorded, so the next block (on any pod) reads its state.
   * The wait is bounded by jumpBudgetMs: past it the promise resolves (with a warning) and the
   * jump is posted anyway, so a hung exec:* Redis call never stalls the conversation.
   */
  beforeJump(message) {
    let store;
    try {
      store = WriteTap.current();
      if (!store || store.kind !== 'action' || typeof store.onJump !== 'function' || !store.executionId) return undefined;
      // hard stop: the aborted action's jump (its error exit, say) is not posted
      if (typeof store.isAborted === 'function' && store.isAborted()) return 'skip';
    } catch (err) {
      warn('beforeJump', err);
      return undefined;
    }
    let recorded;
    try {
      recorded = store.onJump(message && message.payload ? message.payload.text : undefined);
    } catch (err) {
      recorded = Promise.reject(err);
    }
    try {
      if (message && message.payload) {
        message.payload.attributes = Object.assign({}, message.payload.attributes || {}, { execution_id: store.executionId });
      }
    } catch (err) {
      warn('beforeJump', err);
    }
    return withinBudget(Promise.resolve(recorded), getConfig().jumpBudgetMs);
  },

  /**
   * Call subagent, after the replace call: the subagent's first /ext (no execution_id) resolves
   * through the alias to this execution, and the caller's frame goes on agent_stack.
   * No root id known: neither is written, and the subagent starts its own execution.
   */
  async onSubagentCall(ctx, { subagentRootId, returnBlock } = {}) {
    if (!ctx) return null;
    try {
      if (!subagentRootId) {
        winston.warn('(ExecutionRecorder) subagent call without a root id: the subagent will start its own execution');
        return null;
      }
      await ctx._store.setAlias(ctx.request_id, subagentRootId, ctx.execution_id);
      await ctx._store.pushFrame(ctx.execution_id, { agent_id: ctx.agent_id, agent_version: ctx.agent_version, return_block: returnBlock || null });
    } catch (err) {
      warn('onSubagentCall', err);
    }
    return null;
  },

  /**
   * Return stack, after the replace call: pops the caller's frame and deletes this agent's alias.
   * No frame (a return after a replace bot, not a subagent call): the request key is this
   * agent's own execution, and is left alone.
   */
  async onSubagentReturn(ctx) {
    if (!ctx) return null;
    try {
      const frame = await ctx._store.popFrame(ctx.execution_id);
      if (frame) await ctx._store.deleteAlias(ctx.request_id, ctx.agent_id);
    } catch (err) {
      warn('onSubagentReturn', err);
    }
    return null;
  },

  /** Replace bot, after the replace call: the next bot's first execution becomes a child of this one. */
  async onHandedToBot(ctx, { toAgentId } = {}) {
    if (!ctx) return null;
    try {
      await ctx._store.setHandoff(ctx.request_id, { parent_execution_id: ctx.execution_id, to_agent_id: toAgentId });
      return await emit(ctx, 'execution.handed_to_bot', () => ({ to_bot_id: toAgentId }));
    } catch (err) {
      warn('onHandedToBot', err);
      return null;
    }
  },

  /** The theend of a directives run, wrapped so the block exit and the chain end are recorded once. */
  wrapTheEnd(ctx, theend) {
    if (!ctx) return theend;
    let recorded = null;
    return async (...args) => {
      if (!recorded) {
        recorded = (async () => {
          await ExecutionRecorder.blockExit(ctx);
          await ExecutionRecorder.endOfChain(ctx);
        })();
      }
      await recorded;
      return theend(...args);
    };
  }
};

/**
 * The block-entry body: the state before the block (HGETALL), the step.started seq (INCR) and the checkpoint
 * context (stacks, locks) go out in one tick; then the step opens. Throws are caught by blockEntry.
 */
async function enterBlock(ctx, { blockId, blockName }) {
  const cfg = ctx._cfg;
  const scopes = ctx.scopes;
  ctx.scopes = { message_in: new Set(), jump_params: new Set() };
  // state off, or the read failed: the step and its actions still flow, without state fields
  const beforeP = cfg.stateEnabled ? readState(ctx) : null;
  const seqP = ctx._store.nextSeq(ctx.execution_id); // goes out with the HGETALL: one round trip
  const cpP = Checkpointer.loadContext(ctx); // stacks and locks: same tick, same round trip; never rejects
  const before = await beforeP;
  await cpP;
  if (before === null) {
    return await openStep(ctx, blockId, blockName, {}, true, () => ({
      block_id: blockId, block_name: blockName, outside_changes: [], state_keyframe: false, state_manifest: null
    }), seqP);
  }
  // decided on the block count plus the delta bytes folded in so far (deferred jobs add theirs)
  const keyframe = StateDiff.shouldKeyframe({
    isFirstBlock: !ctx._hasState && ctx._blocks === 0,
    blocksSinceKeyframe: ctx.kf.blocks_since,
    deltaBytesSinceKeyframe: ctx.kf.delta_bytes
  }, cfg);
  if (keyframe) ctx.kf = { blocks_since: 0, delta_bytes: 0 };
  const kf = ctx.kf;
  const prev = ctx.prev;
  return await openStep(ctx, blockId, blockName, before, false, () => {
    const outside = StateDiff.diffStates(prev, before, {
      projectKey: ctx._projectKey,
      valueMaxBytes: cfg.stateValueMaxBytes,
      attribute: (key) => scopes.message_in.has(key) ? 'message_in' : (scopes.jump_params.has(key) ? 'jump_params' : 'external')
    });
    const data = {
      block_id: blockId,
      block_name: blockName,
      state_vars: Object.keys(before).length,
      outside_changes: outside.changes,
      state_keyframe: keyframe,
      state_manifest: keyframe ? StateDiff.buildManifest(before, { projectKey: ctx._projectKey }) : null
    };
    if (keyframe) {
      sealInto(ctx, data, 'sealed_state', sealableState(before, cfg.stateValueMaxBytes));
    } else {
      kf.delta_bytes += outside.deltaBytes;
      sealInto(ctx, data, 'sealed_state', outside.sealedValues);
    }
    return data;
  }, seqP);
}

/**
 * Starts ctx.step with the state before the block and emits step.started.
 * stateless: no state fields for this step and its actions, and no state write at its exit.
 */
async function openStep(ctx, blockId, blockName, before, stateless, build, seqP) {
  ctx.step = {
    seq: null, block_id: blockId, block_name: blockName, started_at: Date.now(),
    actions: [], outcome: null, exit_taken: null, before, stateless, exitPending: null
  };
  ctx.current = before;
  ctx._chainEnded = false;
  const step = ctx.step;
  step.seq = await emit(ctx, 'step.started', (seq) => Object.assign({ step_seq: seq }, build()), seqP);
  return step.seq;
}

const NO_DELTA = { changes: [], sealedValues: {}, deltaBytes: 0 };

async function recordAction(ctx, step, rec, { index, directive, startedAt, jumpedTo, error }) {
  try {
    const cfg = ctx._cfg;
    const action = (directive && directive.action) || {};
    const actionId = action._tdActionId;
    // snapshot now: the deferred diff must not see writes made after this point
    const writes = new Map(rec.tap ? rec.tap.writes : []);
    const before = ctx.current;
    const afterP = step.stateless ? null : readState(ctx);
    const seqP = ctx._store.nextSeq(ctx.execution_id); // goes out with the HGETALL: one round trip
    // a directive that (un)locks the intent/action: the checkpoint's locks are re-read in the same tick
    const locksP = directive && Checkpointer.LOCK_TYPES.has(String(directive.name).toLowerCase()) ? Checkpointer.loadLocks(ctx) : null;
    const after = await afterP;
    await locksP;
    if (after) ctx.current = after;
    const kf = ctx.kf;

    const jumped = jumpedTo !== undefined ? jumpedTo : rec.jumpedTo;
    let { outcome, exit_taken } = mapOutcome({ action, jumpedTo: jumped, error });
    if (rec.interrupted) {
      outcome = 'interrupted';
      exit_taken = null;
    }
    rec.outcome = outcome;
    rec.exit_taken = exit_taken;

    const data = {
      step_seq: step.seq,
      action_index: index,
      action_id: actionId === undefined ? null : actionId,
      type: directive ? directive.name : null,
      title: action._tdActionTitle === undefined ? null : action._tdActionTitle,
      outcome,
      exit_taken,
      duration_ms: Date.now() - (startedAt || rec.startedAt)
    };
    if (rec.interrupted) data.error_code = 'hard_stop';
    else if (error) data.error_code = 'action_error';
    if (rec.hardDegraded) data.hard_degraded = true;
    const seq = await emit(ctx, 'action.completed', () => {
      const delta = !after ? NO_DELTA : StateDiff.diffStates(before, after, {
        projectKey: ctx._projectKey,
        valueMaxBytes: cfg.stateValueMaxBytes,
        attribute: (key) => writes.has(key) ? (actionId || `action_${index}`) : 'external'
      });
      kf.delta_bytes += delta.deltaBytes;
      data.state_delta = delta.changes;
      sealInto(ctx, data, 'sealed_state', delta.sealedValues);
      return data;
    }, seqP);
    // the per-action checkpoint: one SET, fire-and-forget; an interrupted action is run again (rerun)
    Checkpointer.writeAt(ctx, step, rec.interrupted
      ? { action_index: index, next_action: 'rerun', seq }
      : { action_index: index + 1, next_action: 'run', seq });
    return seq;
  } catch (err) {
    warn('afterAction', err);
    return null;
  }
}

async function recordBlockExit(ctx, step) {
  try {
    // an action still being recorded belongs to this step
    const pending = step.actions.filter((a) => a.pending);
    await Promise.all(pending.map((a) => a.pending));
    const done = pending.sort((a, b) => a.index - b.index);
    let outcome = 'success';
    for (const a of done) {
      if (OUTCOME_RANK[a.outcome] > OUTCOME_RANK[outcome]) outcome = a.outcome;
    }
    if (ctx._failed) outcome = 'error';
    const last = done[done.length - 1];
    step.outcome = outcome;
    step.exit_taken = last ? last.exit_taken : null;
    const current = ctx.current || step.before;
    const data = {
      step_seq: step.seq,
      outcome,
      exit_taken: step.exit_taken,
      duration_ms: Date.now() - step.started_at
    };
    const seqP = ctx._store.nextSeq(ctx.execution_id);
    ctx.kf.blocks_since += 1;
    ctx._blocks += 1;
    // the state write goes out with the INCR (one round trip); delta bytes of deferred jobs not yet run are counted at the next exit
    const saved = step.stateless ? null : ctx._store.setState(ctx.execution_id, {
      step_seq: step.seq,
      raw: current,
      blocks_since_kf: ctx.kf.blocks_since,
      delta_bytes_since_kf: ctx.kf.delta_bytes
    });
    if (!step.stateless) ctx.prev = current;
    const [seq] = await Promise.all([emit(ctx, 'step.completed', () => {
      if (!step.stateless) {
        data.state_vars = Object.keys(current).length;
        data.changed_keys = countChanged(step.before, current);
      }
      return data;
    }, seqP), saved]);
    return seq;
  } catch (err) {
    warn('blockExit', err);
    return null;
  }
}

/** Fire-and-forget: execution_id into the request attributes. */
function writeExecutionId(ctx, token) {
  try {
    const { TiledeskClient } = require('@tiledesk/tiledesk-client');
    const client = new TiledeskClient({
      projectId: ctx.id_project,
      token,
      APIURL: state.apiEndpoint || process.env.API_ENDPOINT,
      APIKEY: '___'
    });
    client.updateRequestAttributes(ctx.request_id, { execution_id: ctx.execution_id }, (err) => {
      if (err) warn('updateRequestAttributes', err);
    });
  } catch (err) {
    warn('updateRequestAttributes', err);
  }
}

// for the Checkpointer (lazy require): the event and sealing paths every other event uses
ExecutionRecorder._emit = emit;
ExecutionRecorder._sealInto = sealInto;

module.exports = ExecutionRecorder;
