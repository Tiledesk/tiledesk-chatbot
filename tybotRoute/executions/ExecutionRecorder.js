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

/** Allocates the next seq and emits; build(seq) returns the data. Returns the seq or null. */
async function emit(ctx, type, build) {
  const seq = await ctx._store.nextSeq(ctx.execution_id);
  if (seq === null || seq === undefined) return null;
  getEmitter().emit(buildEnvelope({ ctx, seq, type, data: build(seq) }));
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
        if (payload !== undefined && payload !== null) sealInto(ctx, data, 'sealed_trigger_payload', stripSecrets(payload));
        await emit(ctx, 'execution.started', () => data);
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
      if (!cfg.stateEnabled) return await openStep(ctx, blockId, blockName, {}, {
        block_id: blockId, block_name: blockName, outside_changes: [], state_keyframe: false, state_manifest: null
      });
      const before = await readState(ctx);
      if (before === null) return null;
      const scopes = ctx.scopes;
      const outside = StateDiff.diffStates(ctx.prev, before, {
        projectKey: ctx._projectKey,
        valueMaxBytes: cfg.stateValueMaxBytes,
        attribute: (key) => scopes.message_in.has(key) ? 'message_in' : (scopes.jump_params.has(key) ? 'jump_params' : 'external')
      });
      ctx.scopes = { message_in: new Set(), jump_params: new Set() };

      const keyframe = StateDiff.shouldKeyframe({
        isFirstBlock: !ctx._hasState && ctx._blocks === 0,
        blocksSinceKeyframe: ctx.kf.blocks_since,
        deltaBytesSinceKeyframe: ctx.kf.delta_bytes
      }, cfg);
      const data = {
        block_id: blockId,
        block_name: blockName,
        state_vars: Object.keys(before).length,
        outside_changes: outside.changes,
        state_keyframe: keyframe,
        state_manifest: keyframe ? StateDiff.buildManifest(before, { projectKey: ctx._projectKey }) : null
      };
      if (keyframe) {
        ctx.kf = { blocks_since: 0, delta_bytes: 0 };
        sealInto(ctx, data, 'sealed_state', sealableState(before, cfg.stateValueMaxBytes));
      } else {
        ctx.kf.delta_bytes += outside.deltaBytes;
        sealInto(ctx, data, 'sealed_state', outside.sealedValues);
      }
      return await openStep(ctx, blockId, blockName, before, data);
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

/** Starts ctx.step with the state before the block and emits step.started. */
async function openStep(ctx, blockId, blockName, before, data) {
  ctx.step = {
    seq: null, block_id: blockId, block_name: blockName, started_at: Date.now(),
    actions: [], outcome: null, exit_taken: null, before, exitPending: null
  };
  ctx.current = before;
  ctx._chainEnded = false;
  const step = ctx.step;
  step.seq = await emit(ctx, 'step.started', (seq) => Object.assign({ step_seq: seq }, data));
  return step.seq;
}

const NO_DELTA = { changes: [], sealedValues: {}, deltaBytes: 0 };

async function recordAction(ctx, step, rec, { index, directive, startedAt, jumpedTo, error }) {
  try {
    const cfg = ctx._cfg;
    const action = (directive && directive.action) || {};
    const actionId = action._tdActionId;
    const writes = rec.tap ? rec.tap.writes : new Map();
    const after = cfg.stateEnabled ? await readState(ctx) : null;
    const delta = !cfg.stateEnabled ? NO_DELTA : StateDiff.diffStates(ctx.current, after || ctx.current, {
      projectKey: ctx._projectKey,
      valueMaxBytes: cfg.stateValueMaxBytes,
      attribute: (key) => writes.has(key) ? (actionId || `action_${index}`) : 'external'
    });
    if (after) ctx.current = after;
    ctx.kf.delta_bytes += delta.deltaBytes;

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
    data.state_delta = delta.changes;
    sealInto(ctx, data, 'sealed_state', delta.sealedValues);
    return await emit(ctx, 'action.completed', () => data);
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
    if (ctx._cfg.stateEnabled) {
      data.state_vars = Object.keys(current).length;
      data.changed_keys = countChanged(step.before, current);
    }
    const seq = await emit(ctx, 'step.completed', () => data);
    ctx.kf.blocks_since += 1;
    ctx._blocks += 1;
    ctx.prev = current;
    if (!ctx._cfg.stateEnabled) return seq;
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
