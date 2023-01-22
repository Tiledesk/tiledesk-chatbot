class MockTdCache {

  /**
   * Constructor for MockTdCache object
   */
  constructor() {
    this.db = new Map();
  }

  set(k, v) {
    return new Promise( (resolve, reject) => {
        this.db.set(k, "" + v) // saves as string
        resolve();
    });
  }

  get(k) {
    return new Promise( (resolve, reject) => {
        const v = this.db.get(k);
        resolve(v);
    });
  }

  del(k) {
    return new Promise( (resolve, reject) => {
        const v = this.db.delete(k);
        resolve();
    });
  }
}

module.exports = { MockTdCache };