const reply = require('./reply-V4.js');

/**
 * Node `randomreply` — invia UN SOLO messaggio scelto a caso da `data.messages`.
 * Delega a `reply.execute` su un nodo col solo messaggio scelto, così riusa il
 * routing/forward (`direct`) e il rendering del reply.
 */
function execute(node) {
  const messages = (node.data && node.data.messages) || [];
  if (messages.length === 0) return { nextSlotKey: 'direct' };
  const pick = messages[Math.floor(Math.random() * messages.length)];
  const single = { ...node, data: { ...node.data, messages: [pick] } };
  return reply.execute(single);
}

module.exports = { execute };
