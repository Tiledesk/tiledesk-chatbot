
class DirUnlockIntent {

  constructor(tdcache) {
    if (!tdcache) {
      throw new Error('tdcache (TdCache) object is mandatory.');
    }
    this.tdcache = tdcache;
  }

  async execute(requestId, callback) {
    console.log("Unocking intent");
    await this.unlockIntent(requestId);
    callback();
  }

  async unlockIntent(requestId) {
    await this.tdcache.del("tilebot:requests:"  + requestId + ":locked");
    console.log("unlocked.")
  }
  
}

module.exports = { DirUnlockIntent };