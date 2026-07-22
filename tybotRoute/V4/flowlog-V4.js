const { Logger } = require('../Logger');

/**
 * Flow-log del runtime V4 per il pannello di test del Design Studio.
 *
 * Riusa il `Logger` esistente (`tybotRoute/Logger.js`), che pubblica su rabbitmq
 * (`apps.tilechat.logs.<request_id>`, payload `{ text, level, nlevel, intent_id,
 * timestamp }`) — stesso formato dei log V3. Il DS si sottoscrive via MQTT.
 *
 * I metodi `native`/`debug` del Logger sono attivi solo quando `dev === true`
 * (conversazione di test in draft) e `FLOW_LOGS_ENABLED`/`AMQP_MANAGER_URL` sono
 * configurati; altrimenti sono no-op (nessun log in produzione).
 */

// Etichette leggibili per tipo di nodo, allineate ai nomi delle directive V3
// (es. `[Reply] Executed`, `[Add Tag] Executed`).
const NODE_LABEL = {
  start: 'Start',
  reply: 'Reply',
  replyv2: 'Reply',
  randomreply: 'Random Reply',
  defaultFallback: 'Default Fallback',
  close: 'Close',
  agent: 'Agent',
  department: 'Change Department',
  move_to_unassigned: 'Move to Unassigned',
  clear_transcript: 'Clear Transcript',
  add_tags: 'Add Tag',
  condition: 'Condition',
  jsoncondition: 'Condition',
  iteration: 'Iteration',
  wait: 'Wait',
  delete: 'Delete Variable',
  'setattribute-v2': 'Set Variable',
  capture_user_reply: 'Capture User Reply',
  connect_block: 'Connect Block',
  hmessage: 'Hidden Message',
  flow_log: 'Flow Log',
  leadupdate: 'Lead Update',
  replacebotv3: 'Replace Bot',
  ifopenhours: 'Operating Hours',
  ifonlineagentsv2: 'Online Agents',
  webrequestv2: 'Web Request',
  web_response: 'Web Response',
  email: 'Email',
  whatsapp_static: 'WhatsApp',
  whatsapp_attribute: 'WhatsApp',
  send_whatsapp: 'WhatsApp',
  ai_prompt: 'AI Prompt',
  askgptv2: 'Ask KB',
  gpt_assistant: 'GPT Assistant',
  ai_condition: 'AI Condition',
  add_kb_content: 'Add KB Content',
  composio_tool: 'Composio Tool',
};

function labelFor(type) {
  return NODE_LABEL[type] || type;
}

/**
 * Una conversazione è "di test" (draft) — abilita i log `native`/`debug` — quando:
 *  - il widget la marca via `sourcePage` con `td_draft=true` (test chat), OPPURE
 *  - la request è marcata `draft: true` (test **webhook** dal `/dev`: il block
 *    route propaga `req.body.draft` in `message.request.draft`). Senza questo ramo
 *    le invocazioni webhook di test non pubblicherebbero alcun flow-log.
 */
function isDraft(message) {
  if (message && message.request && message.request.draft === true) return true;
  const sp =
    (message && message.request && message.request.attributes && message.request.attributes.sourcePage) ||
    (message && message.attributes && message.attributes.sourcePage) ||
    '';
  return typeof sp === 'string' && sp.indexOf('td_draft=true') > -1;
}

/**
 * Crea il Logger del turno. `dev` (draft) abilita i livelli `native`/`debug`,
 * cioè il trace di esecuzione del flow mostrato nel pannello di test.
 */
function createTurnLogger(requestId, message) {
  return new Logger({ request_id: requestId, dev: isDraft(message) });
}

// Warm-up: il Publisher di `Logger.js` si connette in modo lazy alla PRIMA publish
// e i log emessi durante l'handshake AMQP iniziale vengono persi (quirk noto del
// Publisher). Una publish fittizia al caricamento del modulo (= boot del motore)
// stabilisce la connessione, così i log del PRIMO messaggio reale fluiscono.
// No-op se FLOW_LOGS_ENABLED/AMQP_MANAGER_URL non sono configurati.
try {
  new Logger({ request_id: 'warmup-warmup-warmup', dev: true }).native('[warmup] flow-log publisher');
} catch (e) {
  // non fatale
}

module.exports = { labelFor, createTurnLogger };
