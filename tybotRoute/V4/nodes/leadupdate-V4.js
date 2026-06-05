const winston = require('../../utils/winston');

/**
 * Node `leadupdate` — aggiorna N attributi del lead (`data.update`), risolvendo i
 * `{{var}}` nei valori. La PATCH `/leads/<id>` reale è delegata a un service
 * (`ctx.services.lead`, mock+real); senza service logga soltanto. Forward `direct`.
 */
async function execute(node, ctx) {
  const update = (node.data && node.data.update) || {};
  const resolved = {};
  for (const k of Object.keys(update)) {
    resolved[k] = ctx.fill(String(update[k] != null ? update[k] : ''));
  }
  if (ctx.services && ctx.services.leadUpdate) {
    try { await ctx.services.leadUpdate(resolved, ctx); }
    catch (err) { winston.error('(leadupdate) service error: ', err); }
  } else {
    winston.verbose('(leadupdate) lead update (no service): ' + JSON.stringify(resolved));
  }
  return { nextSlotKey: 'direct' };
}

module.exports = { execute };
