'use strict';

const winston = require('../utils/winston');
const { getConfig, isEnabled } = require('./config');
const { stripSecrets, isSecretName } = require('./secrets');
const Sealer = require('./Sealer');
const { getEmitter, buildEnvelope } = require('./TraceEmitter');
const StateDiff = require('./StateDiff');
const WriteTap = require('./WriteTap');
const { mapOutcome } = require('./OutcomeMapper');
const { detectTrigger } = require('./trigger');

const POLICY_TTL_MS = 60000;
const OUTCOME_RANK = { success: 0, failure_condition: 1, error: 2 };

let state = { store: null, apiEndpoint: null };
let policyCache = new Map();
const deferred = new Set();

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
 */
async function emit(ctx, type, build) {
  const seq = await ctx._store.nextSeq(ctx.execution_id);
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
    if (sealed) data[field] = sealed;
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
    while (deferred.size > 0) await Promise.all([...deferred]);
  },

  async onMessageIn({ message, bot, botId, requestId, projectId, token, store } = {}) {
    if (!isEnabled()) return null;
    try {
      const st = store || state.store;
      if (!st) return null;
      const cfg = getConfig();
      const agentId = (bot && bot.root_id) || botId;
      const agentName = (bot && bot.name) || null;
      const test = !(bot && bot.root_id);
      const trigger = detectTrigger(message, requestId, botId);
      const resolved = await st.resolve({
        requestId,
        agentId,
        hintedExecutionId: message && message.attributes && message.attributes.execution_id,
        meta: { id_project: projectId, agent_version: botId, agent_name: agentName, test, trigger }
      });
      if (!resolved) return null;

      const ctx = {
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
        _captureData: await captureData(st, projectId),
        _hasState: false,
        _blocks: 0,
        _failed: false,
        _chainEnded: false
      };

      const saved = cfg.stateEnabled ? await st.getState(ctx.execution_id) : null;
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
      return ctx;
    } catch (err) {
      warn('onMessageIn', err);
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

  async blockEntry(ctx, { blockId, blockName } = {}) {
    if (!ctx) return null;
    try {
      const cfg = ctx._cfg;
      const scopes = ctx.scopes;
      ctx.scopes = { message_in: new Set(), jump_params: new Set() };
      // state off, or the read failed: the step and its actions still flow, without state fields
      const before = cfg.stateEnabled ? await readState(ctx) : null;
      if (before === null) {
        return await openStep(ctx, blockId, blockName, {}, true, () => ({
          block_id: blockId, block_name: blockName, outside_changes: [], state_keyframe: false, state_manifest: null
        }));
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
      });
    } catch (err) {
      warn('blockEntry', err);
      return null;
    }
  },

  /** Runs one action's execute call with the write tap; a throw or rejection is recorded as `error`. */
  runAction(ctx, { index, directive } = {}, fn) {
    if (!ctx || !ctx.step || ctx._failed) return fn();
    let tapOptions;
    let rec;
    try {
      const step = ctx.step;
      rec = { index, startedAt: Date.now(), jumpedTo: undefined, pending: null, tap: null, outcome: null, exit_taken: null };
      step.actions.push(rec);
      const actionId = directive && directive.action ? directive.action._tdActionId : undefined;
      tapOptions = {
        executionId: ctx.execution_id,
        stepSeq: step.seq,
        actionIndex: index,
        actionId,
        requestId: ctx.request_id,
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

  async endOfChain(ctx) {
    if (!ctx || ctx.jumpInFlight || ctx._failed || ctx._chainEnded) return null;
    try {
      ctx._chainEnded = true;
      if (isAutomation(ctx)) {
        const seq = await emit(ctx, 'execution.ended', () => ({ end_reason: 'completed' }));
        await ctx._store.setStatusHint(ctx.execution_id, 'completed');
        return seq;
      }
      return await emit(ctx, 'execution.idle', (seq) => ({ last_seq: seq }));
    } catch (err) {
      warn('endOfChain', err);
      return null;
    }
  },

  async failed(ctx, { error_code, message } = {}) {
    if (!ctx || ctx._failed) return null;
    try {
      ctx._failed = true;
      const data = { error_code, message };
      if (ctx.step && ctx.step.seq !== null) data.step_seq = ctx.step.seq;
      const seq = await emit(ctx, 'execution.failed', () => data);
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
 * Starts ctx.step with the state before the block and emits step.started.
 * stateless: no state fields for this step and its actions, and no state write at its exit.
 */
async function openStep(ctx, blockId, blockName, before, stateless, build) {
  ctx.step = {
    seq: null, block_id: blockId, block_name: blockName, started_at: Date.now(),
    actions: [], outcome: null, exit_taken: null, before, stateless, exitPending: null
  };
  ctx.current = before;
  ctx._chainEnded = false;
  const step = ctx.step;
  step.seq = await emit(ctx, 'step.started', (seq) => Object.assign({ step_seq: seq }, build()));
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
    const after = step.stateless ? null : await readState(ctx);
    if (after) ctx.current = after;
    const kf = ctx.kf;

    const jumped = jumpedTo !== undefined ? jumpedTo : rec.jumpedTo;
    const { outcome, exit_taken } = mapOutcome({ action, jumpedTo: jumped, error });
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
    if (error) data.error_code = 'action_error';
    return await emit(ctx, 'action.completed', () => {
      const delta = !after ? NO_DELTA : StateDiff.diffStates(before, after, {
        projectKey: ctx._projectKey,
        valueMaxBytes: cfg.stateValueMaxBytes,
        attribute: (key) => writes.has(key) ? (actionId || `action_${index}`) : 'external'
      });
      kf.delta_bytes += delta.deltaBytes;
      data.state_delta = delta.changes;
      sealInto(ctx, data, 'sealed_state', delta.sealedValues);
      return data;
    });
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
    const seq = await emit(ctx, 'step.completed', () => {
      if (!step.stateless) {
        data.state_vars = Object.keys(current).length;
        data.changed_keys = countChanged(step.before, current);
      }
      return data;
    });
    ctx.kf.blocks_since += 1;
    ctx._blocks += 1;
    if (step.stateless) return seq;
    ctx.prev = current;
    await ctx._store.setState(ctx.execution_id, {
      step_seq: step.seq,
      raw: current,
      blocks_since_kf: ctx.kf.blocks_since,
      delta_bytes_since_kf: ctx.kf.delta_bytes
    });
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

module.exports = ExecutionRecorder;
