
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
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      action = {}
    }
    if (this.log) {console.log("Unlocking current intent");}
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    await DirUnlockIntent.unlockIntent(this.context.requestId);
    if (callback) {
      callback();
    }
  }

  // async execute(requestId, callback) {
  //   console.log("Unocking intent");
  //   await this.unlockIntent(requestId);
  //   callback();
  // }

  static async unlockIntent(tdcache, requestId) {
    await tdcache.del("tilebot:requests:"  + requestId + ":locked");
    // await this.tdcache.del("tilebot:requests:"  + requestId + ":locked");
    // console.log("unlocked.")
  }
  
}

module.exports = { DirUnlockIntent };