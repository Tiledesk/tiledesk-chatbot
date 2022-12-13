
class DirLockIntent {

  constructor(tdcache) {
    if (!tdcache) {
      throw new Error('tdcache (TdCache) object is mandatory.');
    }
    this.tdcache = tdcache;
  }

  async execute(directive, requestId, callback) {
    // console.log("Locking intent");
    if (directive.parameter) {
      let intent_name = directive.parameter.trim();
      await this.lockIntent(requestId, intent_name);
      callback();
    }
    else {
      callback();
    }
  }

  async lockIntent(requestId, intent_name) {
    await this.tdcache.set("tilebot:requests:"  + requestId + ":locked", intent_name);
    // console.log("locked.", intent_name);
  }
  
}

module.exports = { DirLockIntent };