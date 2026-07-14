const winston = require('../../utils/winston');

// LogLevel V4 → livello winston (console del server).
const WINSTON_LEVEL = { native: 'info', debug: 'debug', info: 'info', warn: 'warn', error: 'error' };
// LogLevel V4 validi = nomi dei metodi del Logger del turno (`native`/`debug` visibili
// solo in draft/test; `info`/`warn`/`error` sempre). Default `info` (come il DS).
const VALID_LEVELS = { native: 1, debug: 1, info: 1, warn: 1, error: 1 };

/**
 * Node `flow_log` — scrive `data.log` (con `{{var}}` risolte) al livello `data.level`.
 *
 * Va SIA sulla console del server (winston) SIA sul **flow-log del turno**: ritorna
 * un descrittore `flowLog` che `walk` pubblica sul `Logger` del turno (→ rabbitmq →
 * pannello di test del DS). Prima scriveva SOLO su winston, quindi nel log visibile
 * del DS non compariva nulla. Poi forward sullo slot `direct`.
 */
async function execute(node, ctx) {
  const data = node.data || {};
  const level = VALID_LEVELS[data.level] ? data.level : 'info';
  const log = ctx.fill(data.log || '');
  (winston[WINSTON_LEVEL[level]] || winston.info)('(flow_log) ' + log);
  return { nextSlotKey: 'direct', flowLog: { level, text: log } };
}

module.exports = { execute };
