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

// ── Turn token ──────────────────────────────────────────────────────────────
// Token univoco per "turno" (un messaggio utente processato). Serve a coordinare
// l'invio multi-messaggio di un reply con un eventuale nuovo turno concorrente
// (es. click su un bottone durante l'attesa tra un messaggio e il successivo):
// il loop di invio annulla i messaggi rimanenti se il token corrente è cambiato.
const TURN_PREFIX = 'tilebotv4:turn:';
const TURN_TTL_SECONDS = 60 * 60; // 1h: vive solo per il coordinamento in-flight

function turnKey(requestId) {
  return TURN_PREFIX + requestId;
}

async function setTurn(tdcache, requestId, token) {
  if (!tdcache) return;
  try {
    await tdcache.set(turnKey(requestId), token, { EX: TURN_TTL_SECONDS });
  } catch (err) {
    winston.error('(state-V4) setTurn error: ', err);
  }
}

async function getTurn(tdcache, requestId) {
  if (!tdcache) return null;
  try {
    return await tdcache.get(turnKey(requestId));
  } catch (err) {
    winston.error('(state-V4) getTurn error: ', err);
    return null;
  }
}

// ── USER_INPUT (controllo no_input di replyv2) ───────────────────────────────
// Variabile di controllo: quando un nodo `replyv2` si ferma, salva un token e
// schedula un timer. Allo scadere, se il token è ANCORA questo (= nessun input
// utente nel frattempo, perché ogni nuovo turno lo azzera) → triggera il
// connettore `no_input`. Replica `TiledeskChatbotConst.USER_INPUT` del V3.
const USERINPUT_PREFIX = 'tilebotv4:userinput:';

function userInputKey(requestId) {
  return USERINPUT_PREFIX + requestId;
}

async function setUserInput(tdcache, requestId, token) {
  if (!tdcache) return;
  try {
    await tdcache.set(userInputKey(requestId), token, { EX: TURN_TTL_SECONDS });
  } catch (err) {
    winston.error('(state-V4) setUserInput error: ', err);
  }
}

async function getUserInput(tdcache, requestId) {
  if (!tdcache) return null;
  try {
    return await tdcache.get(userInputKey(requestId));
  } catch (err) {
    winston.error('(state-V4) getUserInput error: ', err);
    return null;
  }
}

async function clearUserInput(tdcache, requestId) {
  if (!tdcache) return;
  try {
    if (typeof tdcache.del === 'function') {
      await tdcache.del(userInputKey(requestId));
    } else {
      await tdcache.set(userInputKey(requestId), '', { EX: 1 });
    }
  } catch (err) {
    winston.error('(state-V4) clearUserInput error: ', err);
  }
}

module.exports = {
  getState, setState, clearState,
  setTurn, getTurn,
  setUserInput, getUserInput, clearUserInput,
};
