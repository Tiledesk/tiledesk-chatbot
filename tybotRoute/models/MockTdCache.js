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
    // console.log("incr...", k)
    // return new Promise( (resolve, reject) => {
    // console.log("Promise incr...", k)
    let value = await this.get(k);
    // console.log("value.............", value)
    if (value == undefined || value == null) {
      value = 0;
    }
    try {
      value = Number(value);
    }
    catch(error) {
      // console.error("Error on value = Number(value);", error);
      value = 0
    }
    // console.log("got", k, value)
    let v_incr = Number(value) + 1;
    this.db.set(k, "" + v_incr) // saves as string
    // resolve();
      
    // });
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
}

module.exports = { MockTdCache };