'use strict';

const winston = require('../utils/winston');
const { TiledeskChatbotConst } = require('../engine/TiledeskChatbotConst');
const { Directives } = require('../tiledeskChatbotPlugs/directives/Directives');

const VERSION = 1;
/** The bot token's two copies in :parameters (updateRequestAttributes): never in a checkpoint (spec 7.1.5). */
const TOKEN_KEYS = [TiledeskChatbotConst.REQ_CHATBOT_TOKEN, TiledeskChatbotConst.REQ_CHATBOT_TOKEN_v2];
/** Directives that lock or unlock the intent/action while they run: their after-action write re-reads the locks. */
const LOCK_TYPES = new Set([Directives.CAPTURE_USER_REPLY, Directives.REPLY_V2, Directives.FORM, Directives.LOCK_INTENT, Directives.UNLOCK_INTENT]);

// checkpoint writes and sealed parks in flight (fire-and-forget): drained by ExecutionRecorder._drainForTests
const pending = new Set();
function track(p) {
  pending.add(p);
  p.then(() => pending.delete(p), () => pending.delete(p));
  return p;
}

function warn(op, err) {
  winston.warn('(Checkpointer) ' + op + ' failed: ' + (err && err.message));
}

function emptyContext() {
  return { agent_stack: [], subagent_stack: [], locks: { intent: null, action: null, mcp: null }, last: null };
}

function cpState(ctx) {
  if (!ctx._cp) ctx._cp = emptyContext();
  return ctx._cp;
}

/** Request cache keys of the three locks (TiledeskChatbot: currentLockedIntent / currentLockedAction / currentLockedMpc). */
function lockKeys(requestId) {
  const base = 'tilebot:requests:' + requestId;
  return { intent: base + ':locked', action: base + ':action:locked', mcp: base + ':mcp:locked' };
}

/** Directive names of a block's actions, index for index (what DirectivesChatbotPlug runs: actionsToDirectives). */
function directiveNames(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => (a ? Directives.actionToDirective(a).name : undefined))
    .map((n) => (n === undefined ? null : n));
}

/** subagent:stack frames (raw JSON strings or objects) without the caller's bot token. */
function stripSubagentStack(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    let frame = item;
    if (typeof item === 'string') {
      try { frame = JSON.parse(item); } catch (e) { continue; }
    }
    if (!frame || typeof frame !== 'object') continue;
    const copy = Object.assign({}, frame);
    delete copy.parentToken;
    out.push(copy);
  }
  return out;
}

/** Copy of a raw :parameters hash without chatbotToken / chatbot_jwt_token. */
function withoutTokens(parameters) {
  const out = {};
  for (const [k, v] of Object.entries(parameters || {})) {
    if (!TOKEN_KEYS.includes(k)) out[k] = v;
  }
  return out;
}

/** The three locks, read in one tick. Never rejects: on a Redis error the cached locks stay. */
async function loadLocks(ctx) {
  try {
    const c = ctx._store.client;
    const k = lockKeys(ctx.request_id);
    const [intent, action, mcp] = await Promise.all([c.get(k.intent), c.get(k.action), c.get(k.mcp)]);
    cpState(ctx).locks = { intent: intent || null, action: action || null, mcp: mcp || null };
  } catch (err) {
    warn('read locks', err);
  }
}

/**
 * At block entry, issued with the block's HGETALL and INCR (same round trip): agent_stack, the subagent
 * stack (tokens dropped) and the locks, cached on ctx for this block's per-action writes. Never rejects.
 */
async function loadContext(ctx) {
  try {
    const c = ctx._store.client;
    const st = cpState(ctx);
    const [agentStack, subStack] = await Promise.all([
      c.hGet(`exec:${ctx.execution_id}`, 'agent_stack').catch((err) => { warn('read agent_stack', err); return undefined; }),
      c.lRange(`subagent:stack:${ctx.request_id}`, 0, -1).catch((err) => { warn('read subagent stack', err); return undefined; }),
      loadLocks(ctx)
    ]);
    if (agentStack !== undefined) {
      try { st.agent_stack = agentStack ? JSON.parse(agentStack) : []; } catch (e) { st.agent_stack = []; }
    }
    if (subStack !== undefined) st.subagent_stack = stripSubagentStack(subStack);
  } catch (err) {
    warn('loadContext', err);
  }
}

/**
 * The Redis pointer (Global Constraints shape). agent_stack, locks and the subagent stack come from what
 * loadContext cached on ctx; subagentStack (frames, tokens are dropped) overrides the cached stack.
 */
function build(ctx, { block_id, action_index, next_action, next_action_type, subagentStack, seq, pending_jump } = {}) {
  const st = cpState(ctx);
  const pointer = {
    version: VERSION,
    seq: seq === undefined ? null : seq,
    block_id: block_id === undefined ? null : block_id,
    action_index,
    next_action: next_action === 'rerun' ? 'rerun' : 'run',
    next_action_type: next_action_type === undefined ? null : next_action_type,
    agent_version: ctx.agent_version === undefined ? null : ctx.agent_version,
    agent_stack: Array.isArray(st.agent_stack) ? st.agent_stack : [],
    subagent_stack: subagentStack !== undefined ? stripSubagentStack(subagentStack) : st.subagent_stack,
    locks: Object.assign({ intent: null, action: null, mcp: null }, st.locks),
    trigger: ctx.trigger === undefined ? null : ctx.trigger,
    written_at: new Date().toISOString()
  };
  // a stop seen on a jump in transit (gateMessage): the jump text the resume posts again
  if (typeof pending_jump === 'string' && pending_jump) pointer.pending_jump = pending_jump;
  return pointer;
}

/** SETs a built pointer (seq-guarded, fire-and-forget) and keeps it as the newest on ctx. Never throws. */
function writePointer(ctx, pointer) {
  try {
    if (!ctx || !pointer || pointer.seq === null || pointer.seq === undefined) return null;
    const st = cpState(ctx);
    if (!st.last || st.last.seq < pointer.seq) st.last = pointer;
    track(ctx._store.setCheckpoint(ctx.execution_id, pointer, ctx._cfg && ctx._cfg.checkpointTtlS));
    return pointer;
  } catch (err) {
    warn('write', err);
    return null;
  }
}

/**
 * Builds the pointer for `step` at action_index and SETs it, fire-and-forget (seq-guarded Lua, never
 * awaited). Keeps the newest pointer on ctx for the park points. Returns the pointer, or null (no seq/step).
 */
function writeAt(ctx, step, { action_index, next_action, seq } = {}) {
  try {
    if (!ctx || !step || seq === null || seq === undefined) return null;
    const names = step.directive_names || [];
    const pointer = build(ctx, {
      block_id: step.block_id,
      action_index,
      next_action,
      next_action_type: action_index < names.length ? names[action_index] : null,
      seq
    });
    const st = cpState(ctx);
    if (!st.last || st.last.seq < seq) st.last = pointer;
    track(ctx._store.setCheckpoint(ctx.execution_id, pointer, ctx._cfg && ctx._cfg.checkpointTtlS));
    return pointer;
  } catch (err) {
    warn('write', err);
    return null;
  }
}

/**
 * Parked (idle, stopped, failed): the pointer plus request_state.parameters (without the two token keys),
 * sealed through sealInto, out as execution.checkpoint {sealed, cp_seq}. Not sealed (capture off, no key,
 * or over dataMaxBytes): nothing is emitted, and it is logged. Runs off the flow path. Never rejects.
 */
function sealedPark(ctx, pointer, parametersRaw) {
  if (!ctx || !pointer) return Promise.resolve();
  const parameters = withoutTokens(parametersRaw); // a copy now: the flow may write on
  return track((async () => {
    try {
      await new Promise((resolve) => setImmediate(resolve));
      // lazy: ExecutionRecorder requires this module
      const { _sealInto: sealInto, _emit: emit } = require('./ExecutionRecorder');
      const data = {};
      sealInto(ctx, data, 'sealed', Object.assign({}, pointer, { request_state: { parameters } }));
      if (!data.sealed) {
        const why = !ctx._captureData ? 'capture_data off' : (!ctx._cfg || !ctx._cfg.sealPublicKeyPem ? 'no seal key' : 'over dataMaxBytes');
        const line = `(Checkpointer) no sealed checkpoint for ${ctx.execution_id} at cp_seq ${pointer.seq}: ${why}`;
        if (why === 'over dataMaxBytes') winston.warn(line);
        else winston.debug(line);
        return;
      }
      data.cp_seq = pointer.seq;
      await emit(ctx, 'execution.checkpoint', () => data);
    } catch (err) {
      warn('sealedPark', err);
    }
  })());
}

/** sealedPark with the newest pointer and the :parameters last read (ctx.current). */
function park(ctx) {
  if (!ctx || !ctx._cp || !ctx._cp.last) return Promise.resolve();
  return sealedPark(ctx, ctx._cp.last, ctx.current || (ctx.step && ctx.step.before) || {});
}

async function drain() {
  while (pending.size > 0) await Promise.all([...pending]);
}

module.exports = {
  VERSION,
  TOKEN_KEYS,
  LOCK_TYPES,
  emptyContext,
  lockKeys,
  directiveNames,
  stripSubagentStack,
  withoutTokens,
  loadLocks,
  loadContext,
  build,
  writePointer,
  writeAt,
  sealedPark,
  park,
  drain,
  _pending: pending
};
