const winston = require('../../utils/winston');

class DirUnlockIntent {

  constructor(context) {
    if (!context) {
      throw new Error('config (TiledeskClient) object is mandatory.');
    }
    this.context = context;
    if (!context.tdcache) {
      throw new Error('tdcache (TdCache) object is mandatory.');
    }
    this.tdcache = context.tdcache;
    this.log = context.log;
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

  static async unlockIntent(tdcache, requestId) {
    await tdcache.del("tilebot:requests:"  + requestId + ":locked");
    // await this.tdcache.del("tilebot:requests:"  + requestId + ":locked");
  }
  
}

module.exports = { DirUnlockIntent };