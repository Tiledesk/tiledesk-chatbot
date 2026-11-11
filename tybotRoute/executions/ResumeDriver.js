'use strict';

const os = require('os');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const winston = require('../utils/winston');
const httpUtils = require('../utils/HttpUtils');
const { getConfig, isEnabled } = require('./config');
const { rootIdOf } = require('./botIdentity');
const Checkpointer = require('./Checkpointer');
const { TiledeskChatbotConst } = require('../engine/TiledeskChatbotConst');

const SUBAGENT_STACK_TTL_S = 60 * 60 * 24; // SubagentStack.push
const RESTORED_KEY_TTL_S = 86400; // TdCache.set default, for the locks and the step counters
const TERMINAL = ['completed', 'failed', 'destroyed'];
// not in the server's default selection of a faq_kb (select:false there), or not for a token: never in the payload
const NOT_IN_TOKEN = ['secret', 'connectors', 'description', 'attributes'];
const DURABLE_TIMEOUT_MS = 5000;

function warn(op, err) {
  winston.warn('(ResumeDriver) ' + op + ' failed: ' + (err && err.message));
}

/** A pointer the resume can drive: a block (or a pending jump), an action index, a version, a seq. */
function usable(cp) {
  return !!(cp && typeof cp === 'object' && !Array.isArray(cp) && cp.agent_version &&
    Number.isInteger(cp.action_index) && cp.action_index >= 0 &&
    (cp.block_id || (typeof cp.pending_jump === 'string' && cp.pending_jump.startsWith('/'))) &&
    cp.seq !== null && cp.seq !== undefined);
}

/**
 * The bot JWT for `bot` (loaded with +secret), signed like the server's webhookService.generateChatbotToken
 * (issuer, subject 'bot', audience bots/<id>, a fresh jwtid, the bot's own secret). The payload leaves the
 * secret out (as BotSubscriptionNotifier does for the token /ext normally gets): the token lands in the flow
 * state. Null without a secret. The token is never logged or stored by this module.
 */
function mintBotToken(bot, fallbackId) {
  if (!bot) return null;
  const plain = typeof bot.toObject === 'function' ? bot.toObject() : Object.assign({}, bot);
  const secret = plain.secret;
  if (!secret) return null;
  const id = String(plain._id || fallbackId);
  const payload = JSON.parse(JSON.stringify(plain));
  for (const k of NOT_IN_TOKEN) delete payload[k];
  payload._id = id;
  return jwt.sign(payload, String(secret), {
    issuer: 'https://tiledesk.com',
    subject: 'bot',
    audience: 'https://tiledesk.com/bots/' + id,
    jwtid: uuidv4()
  });
}

async function loadBot(ds, botId) {
  if (!ds || !botId) return null;
  try {
    return (await ds.getBotById(String(botId))) || null;
  } catch (err) {
    return null;
  }
}

/** exec:{id} (identity of the execution); {} when gone or unreadable. */
async function readMeta(store, id) {
  try {
    return (await store.client.hGetAll(`exec:${id}`)) || {};
  } catch (err) {
    warn('read exec hash', err);
    return {};
  }
}

/** The durable checkpoint (service, unsealed once), or null: no URL/token, 404, error, or not usable. */
async function fetchDurable(id, cfg, http) {
  if (!cfg.serviceUrl || !cfg.serviceToken) return null;
  const url = `${cfg.serviceUrl}/internal/executions/${encodeURIComponent(id)}/checkpoint`;
  try {
    const res = await (http || axios).get(url, {
      headers: { 'x-executions-service-token': cfg.serviceToken },
      timeout: DURABLE_TIMEOUT_MS
    });
    const body = res && res.data;
    const cp = body && body.checkpoint && typeof body.checkpoint === 'object' ? body.checkpoint : body;
    if (!usable(cp)) return null;
    return { cp, extra: body || {} };
  } catch (err) {
    const status = err && err.response && err.response.status;
    if (status !== 404) winston.warn('(ResumeDriver) durable checkpoint of ' + id + ' not read: ' + (status ? 'HTTP ' + status : (err && err.message)));
    return null;
  }
}

/** The minimal ctx the recorder's emit needs (envelope identity, seq store). */
function eventCtx(store, cfg, id, ident) {
  return {
    execution_id: id,
    id_project: ident.id_project || null,
    agent_id: ident.agent_id || null,
    agent_version: ident.agent_version || null,
    request_id: ident.request_id || null,
    _store: store,
    _cfg: cfg
  };
}

async function emitFailed(ctx, message) {
  try {
    // lazy: ExecutionRecorder requires modules that require this one's dependencies
    const { _emit: emit } = require('./ExecutionRecorder');
    const data = { error_code: 'resume_failed', message, error: { code: 'resume_failed', message } };
    await emit(ctx, 'execution.failed', () => data);
    await ctx._store.setStatusHint(ctx.execution_id, 'failed');
  } catch (err) {
    warn('emit failed', err);
  }
}

/**
 * Request cache keys before the block runs: :parameters from the durable copy only (the Redis path keeps the
 * live hash), the two token keys with the new token, the intent/action locks of the checkpoint, the MCP lock
 * cleared (C12), and :step / :started reset (spec 7.1.5: limits count again from the resume). One MULTI.
 */
async function restoreRequest(client, { requestId, cp, token, unsealed }) {
  const base = 'tilebot:requests:' + requestId;
  const pkey = base + ':parameters';
  const ttl = parseInt(process.env.FLOW_ATTRIBUTES_TTL, 10) || (15 * 24 * 60 * 60);
  const locks = Object.assign({ intent: null, action: null }, cp.locks || {});
  const lk = Checkpointer.lockKeys(requestId);
  const m = client.multi();
  if (unsealed) {
    const saved = Checkpointer.withoutTokens((cp.request_state && cp.request_state.parameters) || {});
    const fields = {};
    for (const [k, v] of Object.entries(saved)) fields[k] = typeof v === 'string' ? v : JSON.stringify(v);
    m.del(pkey);
    if (Object.keys(fields).length > 0) m.hSet(pkey, fields);
  }
  m.hSet(pkey, {
    [TiledeskChatbotConst.REQ_CHATBOT_TOKEN]: JSON.stringify(token),
    [TiledeskChatbotConst.REQ_CHATBOT_TOKEN_v2]: JSON.stringify('JWT ' + token)
  });
  m.expire(pkey, ttl);
  const ex = { EX: RESTORED_KEY_TTL_S };
  if (locks.intent) m.set(lk.intent, String(locks.intent), ex); else m.del(lk.intent);
  if (locks.action) m.set(lk.action, String(locks.action), ex); else m.del(lk.action);
  m.del(lk.mcp);
  m.set(base + ':step', '0', ex);
  m.set(base + ':started', '0', ex);
  await m.exec();
}

/**
 * C5: the caller frames of a subagent (subagent:stack:{req}), re-pushed when the Redis list expired, each
 * parentToken re-minted for the frame's root bot (parentParticipantId). Order kept (head = innermost caller).
 */
async function restoreSubagentStack(client, ds, { requestId, frames }) {
  if (!Array.isArray(frames) || frames.length === 0) return;
  const key = 'subagent:stack:' + requestId;
  if ((await client.lLen(key)) > 0) return; // still alive: its tokens are the live ones
  const out = [];
  for (const f of frames) {
    const pid = f.parentParticipantId || f.parentId;
    const token = mintBotToken(await loadBot(ds, pid), pid);
    if (!token) winston.warn('(ResumeDriver) subagent frame re-pushed without a token: caller bot not loadable');
    out.push(JSON.stringify(Object.assign({}, f, { parentToken: token })));
  }
  await client.multi().rPush(key, out).expire(key, SUBAGENT_STACK_TTL_S).exec();
}

async function restoreAgentStack(store, id, stack) {
  if (!Array.isArray(stack) || stack.length === 0) return;
  try {
    const current = await store.client.hGet(`exec:${id}`, 'agent_stack');
    if (current) return;
    await store._hSetIfExists(id, 'agent_stack', JSON.stringify(stack));
  } catch (err) {
    warn('restore agent_stack', err);
  }
}

function post(url, message) {
  return new Promise((resolve) => {
    try {
      httpUtils.request({ url, headers: { 'Content-Type': 'application/json' }, json: message, method: 'POST' }, (err) => {
        if (err) {
          // never the raw error: it carries the request body (bot token)
          winston.error('(ResumeDriver) resume post failed: ', httpUtils.constructor.errorSummary(err, url));
          return resolve(false);
        }
        resolve(true);
      }, false);
    } catch (err) {
      warn('resume post', err);
      resolve(false);
    }
  });
}

const ResumeDriver = {

  /**
   * One {type:"resume", execution_id} from exec:control (every pod gets it). The SET owner NX winner loads the
   * checkpoint (Redis, then the service), loads the version, mints the token, restores the request keys, sets
   * transit, lets go of the lease and posts the self-jump to /ext/<agent_version> with attributes.resume (C6).
   * deps: { botsDataSource(botId) -> data source, store?, cfg?, pod?, endpoint?, http? }.
   * 'disabled' with the flag off (nothing at all is touched); 'no_checkpoint' (silent) for a gone or terminal
   * execution; 'not_requested' when the hash is not running with resume_requested_seq = the checkpoint seq
   * (P5); 'not_owner' when another pod or claim has it. Never throws.
   */
  async handle(executionId, deps = {}) {
    if (!isEnabled()) return 'disabled';
    const id = executionId;
    const cfg = deps.cfg || getConfig();
    // lazy: ExecutionRecorder requires this module's siblings
    const store = deps.store || require('./ExecutionRecorder').store();
    if (!store || typeof id !== 'string' || !id) return 'not_owner';
    const pod = deps.pod || os.hostname();
    if ((await store.acquireLease(id, pod, cfg.leaseMs)) !== true) return 'not_owner';
    let leased = true;
    let claimed = null;
    const letGo = async () => {
      if (leased) {
        leased = false;
        await store.releaseLease(id, pod);
      }
    };
    try {
      const meta = await readMeta(store, id);
      // gone, expired or terminal (destroyed...): nothing to resume, and the hash is never written to
      if (!meta.status || TERMINAL.includes(meta.status)) return 'no_checkpoint';
      // P5: the service sets status running and resume_requested_seq (the checkpoint it resumes) before it
      // publishes; anything else is a late or foreign copy of a publish
      const requested = meta.resume_requested_seq;
      if (meta.status !== 'running' || requested === undefined || requested === null || requested === '') return 'not_requested';
      let cp = await store.getCheckpoint(id);
      let unsealed = false;
      let extra = {};
      if (!usable(cp)) {
        const durable = await fetchDurable(id, cfg, deps.http);
        cp = durable ? durable.cp : null;
        extra = durable ? durable.extra : {};
        unsealed = !!durable;
      }
      // identity: the exec hash, else what the service sent with the durable copy
      const ident = {
        id_project: meta.id_project || extra.id_project || null,
        agent_id: meta.agent_id || extra.agent_id || null,
        agent_version: (cp && cp.agent_version) || meta.agent_version || null,
        request_id: meta.request_id || extra.request_id || null
      };
      const ctx = eventCtx(store, cfg, id, ident);
      if (!cp || !ident.request_id || !ident.id_project) {
        await emitFailed(ctx, 'no checkpoint');
        return 'no_checkpoint';
      }
      // the checkpoint moved on (the resumed block ran): this publish was already served
      if (String(cp.seq) !== String(requested)) return 'not_requested';
      if ((await store.claimResume(id, cp.seq, Math.max(cfg.transitMs, cfg.leaseMs))) !== true) return 'not_owner';
      claimed = cp.seq;

      const ds = typeof deps.botsDataSource === 'function' ? deps.botsDataSource(cp.agent_version, ident.id_project) : null;
      const version = await loadBot(ds, cp.agent_version);
      if (!version) {
        await emitFailed(ctx, 'agent version not found');
        return 'bot_gone';
      }
      // the request participant: the version's root (for a subagent, the subagent's root), a draft itself
      const participantId = rootIdOf(version) || cp.agent_version;
      const participant = String(participantId) === String(cp.agent_version) ? version : await loadBot(ds, participantId);
      const token = mintBotToken(participant, participantId);
      if (!token) {
        await emitFailed(ctx, 'agent version not found');
        return 'bot_gone';
      }

      await restoreRequest(store.client, { requestId: ident.request_id, cp, token, unsealed });
      await restoreSubagentStack(store.client, ds, { requestId: ident.request_id, frames: cp.subagent_stack });
      await restoreAgentStack(store, id, cp.agent_stack);

      // hand-over as for a jump: the /ext pod takes the lease and clears transit
      await store.setTransit(id, cfg.transitMs);
      await letGo();
      const request = { request_id: ident.request_id, id_project: ident.id_project };
      if (meta.test === 'true') request.draft = true;
      const message = {
        payload: {
          _id: uuidv4(),
          senderFullname: '_tdinternal',
          type: 'text',
          sender: '_tdinternal',
          recipient: ident.request_id,
          text: cp.pending_jump || ('/#' + cp.block_id),
          id_project: ident.id_project,
          request,
          attributes: {
            execution_id: id,
            resume: {
              execution_id: id,
              block_id: cp.block_id || null, // the index applies to this block only (contract 9)
              action_index: cp.action_index,
              next_action: cp.next_action === 'rerun' ? 'rerun' : 'run',
              next_action_type: cp.next_action_type === undefined ? null : cp.next_action_type,
              from_seq: cp.seq,
              checkpoint_unsealed: unsealed
            }
          }
        },
        token
      };
      // lazy: TilebotService requires the recorder
      const endpoint = deps.endpoint || require('../services/TilebotService').endpoint();
      if (!(await post(`${endpoint}/ext/${cp.agent_version}`, message))) {
        await emitFailed(ctx, 'resume post failed');
        return 'post_failed';
      }
      claimed = null; // posted: the /ext run takes the claim
      return 'started';
    } catch (err) {
      warn('handle', err);
      return 'not_owner';
    } finally {
      // not posted: the claim goes, so the same checkpoint can be resumed again
      if (claimed !== null) await store.releaseResumeClaim(id, claimed);
      await letGo();
    }
  },

  _mintBotToken: mintBotToken
};

module.exports = ResumeDriver;
