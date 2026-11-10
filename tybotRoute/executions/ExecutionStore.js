'use strict';

const { v7: uuidv7 } = require('uuid');
const winston = require('../utils/winston');

const TTL = 604800; // 7 d
const HANDOFF_TTL = 600;
const TERMINAL = ['completed', 'failed', 'destroyed'];

// Replace the request key only if it still holds the terminal id we saw: of
// concurrent resolvers exactly one wins, the others re-read the winner's id.
const CAS_SCRIPT = "if redis.call('GET', KEYS[1]) == ARGV[1] then " +
  "redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]); return 1 else return 0 end";

const CAD_SCRIPT = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";

// HSET only on a live hash: an expired exec:{id} is never recreated (it would have no TTL).
const HSET_IF_EXISTS = "if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]) else return 0 end";

// Lease renew / release only by the pod whose id is stored (compare-and-act).
const RENEW_SCRIPT = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end";

function reqKey(requestId, agentId) { return `exec:req:${requestId}:${agentId}`; }
function execKey(id) { return `exec:${id}`; }

/**
 * Redis access for the exec:* keys (spec 8.2). Takes a node-redis v4 client.
 * No method throws: Redis errors are logged at warn and the method returns
 * null (or resolves void), so the flow never depends on this store.
 */
class ExecutionStore {
  constructor(redisClient) {
    this.client = redisClient;
  }

  _warn(op, err) {
    winston.warn(`[ExecutionStore] ${op} failed: ${err && err.message}`);
  }

  /**
   * withState: the reused execution's exec:{id}:state is read together with its status (one round
   * trip) and returned as `state`; a created execution has none (null). Without it `state` is undefined.
   */
  async resolve({ requestId, agentId, hintedExecutionId, meta, withState }) {
    try {
      const c = this.client;
      // status and state of a candidate in one round trip; status is always written, so null means gone
      const probe = (id) => Promise.all([c.hGet(execKey(id), 'status'), withState ? this.getState(id) : undefined]);
      const reused = (id, state) => ({ executionId: id, created: false, previousExecutionId: null, parentExecutionId: null, state });
      if (hintedExecutionId) {
        const [hintedStatus, state] = await probe(hintedExecutionId);
        if (hintedStatus != null && !TERMINAL.includes(hintedStatus)) return reused(hintedExecutionId, state);
      }
      const key = reqKey(requestId, agentId);
      const current = await c.get(key);
      let previousExecutionId = null;
      if (current) {
        const [status, state] = await probe(current);
        if (!TERMINAL.includes(status)) return reused(current, state);
        previousExecutionId = current;
      }

      const id = uuidv7();
      let won;
      if (current) {
        won = (await c.eval(CAS_SCRIPT, { keys: [key], arguments: [current, id, String(TTL)] })) === 1;
      } else {
        won = (await c.set(key, id, { NX: true, EX: TTL })) !== null;
      }
      if (!won) {
        const winner = await c.get(key);
        if (!winner) return null;
        return reused(winner, withState ? await this.getState(winner) : undefined);
      }

      const m = meta || {};
      try {
        await c.multi()
          .hSet(execKey(id), {
            id_project: String(m.id_project),
            agent_id: String(agentId),
            agent_version: String(m.agent_version),
            agent_name: String(m.agent_name == null ? '' : m.agent_name),
            request_id: String(requestId),
            test: m.test ? 'true' : 'false',
            trigger: JSON.stringify(m.trigger == null ? null : m.trigger),
            status: 'running',
            created_at: new Date().toISOString()
          })
          .expire(execKey(id), TTL)
          .exec();
      } catch (err) {
        // roll back the request key (only if still ours) so the next message retries creation
        try { await c.eval(CAD_SCRIPT, { keys: [key], arguments: [id] }); } catch (e) { this._warn('resolve rollback', e); }
        throw err;
      }

      let parentExecutionId = null;
      try {
        const raw = await c.get(`exec:handoff:${requestId}`);
        if (raw) {
          const h = JSON.parse(raw);
          if (h && h.to_agent_id === agentId) {
            await c.getDel(`exec:handoff:${requestId}`);
            parentExecutionId = h.parent_execution_id || null;
          }
        }
      } catch (err) {
        this._warn('resolve handoff', err);
        parentExecutionId = null;
      }
      return { executionId: id, created: true, previousExecutionId, parentExecutionId, state: withState ? null : undefined };
    } catch (err) {
      this._warn('resolve', err);
      return null;
    }
  }

  async nextSeq(id) {
    try {
      const key = `exec:${id}:seq`;
      const n = await this.client.incr(key);
      if (n === 1) await this.client.expire(key, TTL);
      return n;
    } catch (err) {
      this._warn('nextSeq', err);
      return null;
    }
  }

  async getState(id) {
    try {
      const raw = await this.client.get(`exec:${id}:state`);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      this._warn('getState', err);
      return null;
    }
  }

  async setState(id, value) {
    try {
      await this.client.set(`exec:${id}:state`, JSON.stringify(value), { EX: TTL });
    } catch (err) {
      this._warn('setState', err);
    }
  }

  async setAlias(requestId, agentId, executionId) {
    try {
      await this.client.set(reqKey(requestId, agentId), executionId, { EX: TTL });
    } catch (err) {
      this._warn('setAlias', err);
    }
  }

  async deleteAlias(requestId, agentId) {
    try {
      await this.client.del(reqKey(requestId, agentId));
    } catch (err) {
      this._warn('deleteAlias', err);
    }
  }

  _hSetIfExists(id, field, value) {
    return this.client.eval(HSET_IF_EXISTS, { keys: [execKey(id)], arguments: [field, value] });
  }

  async _stack(id) {
    const raw = await this.client.hGet(execKey(id), 'agent_stack');
    return raw ? JSON.parse(raw) : [];
  }

  async pushFrame(id, frame) {
    try {
      const stack = await this._stack(id);
      stack.push(frame);
      await this._hSetIfExists(id, 'agent_stack', JSON.stringify(stack));
    } catch (err) {
      this._warn('pushFrame', err);
    }
  }

  async popFrame(id) {
    try {
      const stack = await this._stack(id);
      if (stack.length === 0) return null;
      const frame = stack.pop();
      await this._hSetIfExists(id, 'agent_stack', JSON.stringify(stack));
      return frame;
    } catch (err) {
      this._warn('popFrame', err);
      return null;
    }
  }

  async setHandoff(requestId, value) {
    try {
      await this.client.set(`exec:handoff:${requestId}`, JSON.stringify(value), { EX: HANDOFF_TTL });
    } catch (err) {
      this._warn('setHandoff', err);
    }
  }

  /** 'soft' | 'hard' | null (no flag, unknown value, or Redis error). */
  async getStop(id) {
    try {
      const v = await this.client.get(`exec:${id}:stop`);
      return v === 'soft' || v === 'hard' ? v : null;
    } catch (err) {
      this._warn('getStop', err);
      return null;
    }
  }

  async acquireLease(id, pod, ms) {
    try {
      return (await this.client.set(`exec:${id}:owner`, pod, { NX: true, PX: ms })) !== null;
    } catch (err) {
      this._warn('acquireLease', err);
      return false;
    }
  }

  async renewLease(id, pod, ms) {
    try {
      return (await this.client.eval(RENEW_SCRIPT, { keys: [`exec:${id}:owner`], arguments: [pod, String(ms)] })) === 1;
    } catch (err) {
      this._warn('renewLease', err);
      return false;
    }
  }

  async releaseLease(id, pod) {
    try {
      await this.client.eval(CAD_SCRIPT, { keys: [`exec:${id}:owner`], arguments: [pod] });
    } catch (err) {
      this._warn('releaseLease', err);
    }
  }

  async setTransit(id, ms) {
    try {
      await this.client.set(`exec:${id}:transit`, String(Date.now()), { PX: ms });
    } catch (err) {
      this._warn('setTransit', err);
    }
  }

  async clearTransit(id) {
    try {
      await this.client.del(`exec:${id}:transit`);
    } catch (err) {
      this._warn('clearTransit', err);
    }
  }

  async setStatusHint(id, status) {
    try {
      await this._hSetIfExists(id, 'status', status);
    } catch (err) {
      this._warn('setStatusHint', err);
    }
  }
}

module.exports = { ExecutionStore, TERMINAL };
