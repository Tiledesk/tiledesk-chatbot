/** Node `clear_transcript` — azzera il transcript della conversazione, poi forward `direct`. */
async function execute(node, ctx) {
  if (ctx.services) await ctx.services.clearTranscript(ctx);
  return { nextSlotKey: 'direct' };
}
module.exports = { execute };
