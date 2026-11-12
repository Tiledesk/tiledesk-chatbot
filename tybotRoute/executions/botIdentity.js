'use strict';

/**
 * The root (published-agent) id of a bot, or null for a draft.
 * The bot is plain JSON when served from the Redis cache, but a Mongoose document on a cache miss;
 * tybot's faq_kb schema has no root_id, so the document keeps it only in _doc / toObject().
 */
function rootIdOf(bot) {
  if (!bot) return null;
  return bot.root_id
    ?? bot._doc?.root_id
    ?? (typeof bot.toObject === 'function' ? bot.toObject().root_id : undefined)
    ?? null;
}

module.exports = { rootIdOf };
