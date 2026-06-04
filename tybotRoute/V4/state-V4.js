const winston = require('../utils/winston');

/**
 * Stato conversazione per il motore V4, su Redis (via `tdcache`).
 *
 * Namespace dedicato `tilebotv4:` → NON tocca lo stato del runtime V3.
 * Forma dello stato:
 *   {
 *     currentNodeId: string | null,   // ultimo nodo eseguito che attende input
 *     awaitingButtons: [ { value, nextNode } ],  // bottoni dell'ultimo reply
 *   }
 */

const PREFIX = 'tilebotv4:state:';
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 giorni, come il request→bot del V3

function key(requestId) {
  return PREFIX + requestId;
}

async function getState(tdcache, requestId) {
  if (!tdcache) return null;
  try {
    const raw = await tdcache.get(key(requestId));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    winston.error('(state-V4) getState error: ', err);
    return null;
  }
}

async function setState(tdcache, requestId, state) {
  if (!tdcache) return;
  try {
    await tdcache.set(key(requestId), JSON.stringify(state || {}), { EX: TTL_SECONDS });
  } catch (err) {
    winston.error('(state-V4) setState error: ', err);
  }
}

async function clearState(tdcache, requestId) {
  if (!tdcache) return;
  try {
    // alcuni client espongono del(); fallback a set vuoto se assente
    if (typeof tdcache.del === 'function') {
      await tdcache.del(key(requestId));
    } else {
      await tdcache.set(key(requestId), JSON.stringify({}), { EX: 1 });
    }
  } catch (err) {
    winston.error('(state-V4) clearState error: ', err);
  }
}

module.exports = { getState, setState, clearState };
