const winston = require('../../utils/winston');

/**
 * Node `hmessage` (hidden message) — logga `data.text` (con `{{var}}` risolte),
 * invisibile in chat. Poi forward `direct`.
 */
async function execute(node, ctx) {
  const text = ctx.fill((node.data && node.data.text) || '');
  if (text) winston.verbose('(hmessage) ' + text);
  return { nextSlotKey: 'direct' };
}

module.exports = { execute };
