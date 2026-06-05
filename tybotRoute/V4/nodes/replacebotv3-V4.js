const winston = require('../../utils/winston');

/**
 * Node `replacebotv3` — sostituisce il bot della conversazione (by id o, se
 * `useSlug`, by slug) e opzionalmente salta a `blockName`. Lo switch reale
 * (transfer lato server) è delegato a un service (`ctx.services.bot`, mock+real);
 * senza service logga soltanto. Forward `direct`.
 */
async function execute(node, ctx) {
  const data = node.data || {};
  const target = data.useSlug ? ctx.fill(data.botSlug || '') : (data.botId || '');
  const blockName = ctx.fill(data.blockName || '');
  if (ctx.services && ctx.services.replaceBot) {
    try { await ctx.services.replaceBot({ target, useSlug: !!data.useSlug, blockName }, ctx); }
    catch (err) { winston.error('(replacebotv3) service error: ', err); }
  } else {
    winston.verbose('(replacebotv3) replace bot (no service): target=' + target + ' block=' + blockName);
  }
  return { nextSlotKey: 'direct' };
}

module.exports = { execute };
