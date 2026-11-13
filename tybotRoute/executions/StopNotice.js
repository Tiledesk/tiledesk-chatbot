'use strict';

// A user who writes while the agent's execution is stopped gets no answer (the message is dropped by design),
// and the widget keeps its "thinking" dots. The stop notice tells them, once per stop: a visible message from the
// agent in the conversation (it also clears the dots, and the operator sees it in the agent chat).
//
// Per project (the executions service writes them into exec:policy:{id_project}):
//   stop_notice       "false" turns it off; absent or anything else: on
//   stop_notice_text  the text; empty or absent: DEFAULTS by the conversation's language
// Once per stop: SET exec:{id}:notice NX (the executions API deletes it with every new stop flag).

const winston = require('../utils/winston');

const DEFAULTS = {
  en: 'The assistant is paused right now. Please write again in a few minutes.',
  it: "L'assistente è momentaneamente in pausa. Riscrivi tra qualche minuto."
};
const POLICY_TTL_MS = 60000;
const MARK_TTL_S = 604800; // 7 d, as the stop flag
const cache = new Map();

function warn(op, err) {
  winston.warn('(StopNotice) ' + op + ' failed: ' + (err && err.message));
}

/** The conversation's language: request.language, else the user's attributes; null when unknown. */
function languageOf(message) {
  const req = message && message.request;
  const attrs = (message && message.attributes) || {};
  const raw = (req && req.language) || attrs.userLang || attrs.lang || (req && req.attributes && req.attributes.userLang);
  return typeof raw === 'string' && raw ? raw.toLowerCase() : null;
}

/** The text to send: the project's own, else the default in the conversation's language (English otherwise). */
function textFor(custom, lang) {
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  const base = typeof lang === 'string' ? lang.slice(0, 2) : '';
  return DEFAULTS[base] || DEFAULTS.en;
}

/** { enabled, text } of the project, cached 60 s in memory. A Redis error: on, default text. */
async function policy(client, idProject) {
  const hit = cache.get(idProject);
  if (hit && Date.now() - hit.at < POLICY_TTL_MS) return hit.value;
  let value = { enabled: true, text: null };
  try {
    const [enabled, text] = await client.hmGet(`exec:policy:${idProject}`, ['stop_notice', 'stop_notice_text']);
    value = { enabled: enabled !== 'false', text: text || null };
  } catch (err) {
    warn('policy read', err);
  }
  cache.set(idProject, { value, at: Date.now() });
  return value;
}

/**
 * The first user message of this stop gets the notice; later ones nothing. Never throws, and its errors only
 * log: the gate's answer does not depend on it. send(text) posts the message (injected: tests, the client).
 * Resolves 'sent' | 'off' | 'already' | 'failed'.
 */
async function notify({ client, idProject, executionId, message, send }) {
  try {
    const p = await policy(client, idProject);
    if (!p.enabled) return 'off';
    const first = (await client.set(`exec:${executionId}:notice`, '1', { NX: true, EX: MARK_TTL_S })) !== null;
    if (!first) return 'already';
    await send(textFor(p.text, languageOf(message)));
    return 'sent';
  } catch (err) {
    warn('notify', err);
    return 'failed';
  }
}

/** The message the agent posts: a plain text bubble, marked so it can be told apart. */
function noticeMessage(text) {
  return { text, type: 'text', attributes: { execution_notice: 'stopped' } };
}

function _clearCacheForTests() {
  cache.clear();
}

module.exports = { notify, textFor, languageOf, noticeMessage, DEFAULTS, _clearCacheForTests };
