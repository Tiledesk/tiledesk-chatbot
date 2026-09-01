const winston = require('../../utils/winston');
const IntentLock = require('../../engine/IntentLock');
const { BaseDirective } = require('../BaseDirective');
const { Directives } = require('../Directives');

class DirLockIntent extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.LOCK_INTENT];

  constructor(context) {
    super(context);
    if (!context.tdcache) {
      throw new Error('tdcache (TdCache) object is mandatory.');
    }
  }

  async execute(directive, callback) {
    winston.verbose("Execute LockIntent directive");
    let action;
    if (directive.action) {
      action = directive.action;
    } else {
      winston.warn("DirLockIntent Incorrect directive: ", directive);
      callback();
      return;
    }
    // if (directive.parameter) {
    //   let intent_name = directive.parameter.trim();
    //   await this.lockIntent(requestId, intent_name);
    //   callback();
    // }
    // else {
    //   callback();
    // }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    winston.debug("(DirLockIntent) Action: ", action);
    let intent_name = action.intentName;
    // let variable_name = action.body.variableName;
    await DirLockIntent.lockIntent(this.tdcache, this.context.requestId, intent_name); //, variable_name);
    winston.debug("(DirLockIntent) Locked intent:", action.intentName);
    if (callback) {
      callback();
    }
  }

  // Delegates to IntentLock (engine/IntentLock.js).
  static async lockIntent(tdcache, requestId, intent_name) { //}, variable_name) {
    return await IntentLock.lockIntent(tdcache, requestId, intent_name);
  }

}

module.exports = { DirLockIntent };