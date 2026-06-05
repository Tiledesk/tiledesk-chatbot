/**
 * Node `connect_block` — jump esplicito a un altro nodo del flow. Tutta la
 * semantica è nella topologia: lo slot `direct` punta al nodo target.
 */
async function execute() {
  return { nextSlotKey: 'direct' };
}

module.exports = { execute };
