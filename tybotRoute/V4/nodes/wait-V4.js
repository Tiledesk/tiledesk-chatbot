const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_WAIT_MS = 120000; // 120s, come il range della UI

/** Node `wait` — pausa di `data.millis` ms, poi forward sullo slot `direct`. */
async function execute(node) {
  const millis = Math.min(Math.max(Number(node.data && node.data.millis) || 0, 0), MAX_WAIT_MS);
  if (millis > 0) await sleep(millis);
  return { nextSlotKey: 'direct' };
}

module.exports = { execute };
