const winston = require('../../utils/winston');

// Mappa il LogLevel V4 sui livelli winston.
const LEVEL = { native: 'info', debug: 'debug', info: 'info', warn: 'warn', error: 'error' };

/** Node `flow_log` — logga `data.log` con severità `data.level`; forward `direct`. */
async function execute(node, ctx) {
  const data = node.data || {};
  const level = LEVEL[data.level] || 'info';
  const log = ctx.fill(data.log || '');
  (winston[level] || winston.info)('(flow_log) ' + log);
  return { nextSlotKey: 'direct' };
}

module.exports = { execute };
