class MockTdCache {

  /**
   * Constructor for MockTdCache object
   */
  constructor() {
    this.db = new Map();
  }

  async set(k, v) {
    return new Promise( (resolve, reject) => {
        this.db.set(k, "" + v) // saves as string
        resolve();
    });
  }

  async incr(k) {
    let value = await this.get(k);
    if (value == undefined || value == null) {
      value = 0;
    }
    try {
      value = Number(value);
    }
    catch(error) {
      value = 0
    }
    let v_incr = Number(value) + 1;
    this.db.set(k, "" + v_incr) // saves as string
  }

  async get(k) {
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

  async setJSON(key, value, options) {
    return new Promise( (resolve, reject) => {
      const _string = JSON.stringify(value);
      this.set(key, _string);
      resolve();
    });
  }

}

module.exports = { MockTdCache };