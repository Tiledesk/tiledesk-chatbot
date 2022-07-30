const Database = require("@replit/database")

class KVBaseReplit {

  /**
   * Constructor for Key Value Database adapter object
   *
   * @example
   * const { KVBase } = require('./KVBase');
   * 
   */

  constructor() {
    this.db = new Database();
  }

  set(k, v) {
    return new Promise(resolve => {
      this.db.set(k, v).then(() => {resolve();});
    });
  }

  get(k) {
    return new Promise(resolve => {
      this.db.get(k).then(value => {resolve(value)});
    });
  }
}

module.exports = { KVBaseReplit };