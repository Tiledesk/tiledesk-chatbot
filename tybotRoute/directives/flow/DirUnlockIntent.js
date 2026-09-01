const winston = require('../../utils/winston');
const IntentLock = require('../../engine/IntentLock');
const { BaseDirective } = require('../BaseDirective');
const { Directives } = require('../Directives');

class DirUnlockIntent extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.UNLOCK_INTENT];

  constructor(context) {
    super(context);
    if (!context.tdcache) {
      throw new Error('tdcache (TdCache) object is mandatory.');
    }
  }

  async execute(directive, callback) {
    winston.verbose("Execute UnlockIntent directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      action = {}
    }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    winston.debug("(DirUnlockIntent) Action: ", action);
    await DirUnlockIntent.unlockIntent(this.tdcache, this.context.requestId);
    if (callback) {
      callback();
    }
  }

  // async execute(requestId, callback) {
  //   await this.unlockIntent(requestId);
  //   callback();
  // }

  // Delegates to IntentLock (engine/IntentLock.js).
  static async unlockIntent(tdcache, requestId) {
    return await IntentLock.unlockIntent(tdcache, requestId);
  }

}

module.exports = { DirUnlockIntent };
