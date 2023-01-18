
class DirWait {

  constructor() {
  }

  execute(directive, callback) {
    //  500ms < wait-time < 10.000ms
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else if (directive.parameter) {
      let millis = 500;
      const _millis = parseInt(directive.parameter.trim());
      if (!Number.isNaN(millis)) {
        millis = _millis;
      }
      if (millis > 20000) {
        millis = 20000
      }
      else if (millis < 1000) {
        millis = 1000
      }
      action = {
        // body: {
          millis: millis
        // }
      }
    }
    else {
      action = {
        // body: {
          millis: 500
        // }
      }
    }
    this.go(action, () => {
      callback();
    })
  }

  go(action, callback) {
    setTimeout(() => {
      callback();
    }, action.millis);
  }
}

module.exports = { DirWait };