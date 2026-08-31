const winston = require('../utils/winston');

/**
 * IntentLock
 *
 * Intent lock/unlock cache primitives, extracted verbatim from DirLockIntent
 * and DirUnlockIntent. Both the engine and those directives delegate here, so
 * the engine no longer has to require the directives (which required the
 * engine back: that was the circular dependency).
 */

async function lockIntent(tdcache, requestId, intent_name) { //}, variable_name) {
  if (tdcache != null && requestId != null && intent_name != null) {
    await tdcache.set("tilebot:requests:"  + requestId + ":locked", intent_name);
  }
  else {
    winston.error("(DirLockIntent) lockIntent recoverable error, one of requestId: " + requestId + " intent_name: " + intent_name + " is not valid");
  }

  // if (variable_name) {
  //   await this.tdcache.set("tilebot:requests:"  + requestId + ":lockedValue", variable_name);
  // }
}

async function unlockIntent(tdcache, requestId) {
  await tdcache.del("tilebot:requests:"  + requestId + ":locked");
}

module.exports = { lockIntent, unlockIntent };
