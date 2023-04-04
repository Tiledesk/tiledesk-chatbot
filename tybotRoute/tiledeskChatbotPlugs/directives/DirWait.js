
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
        millis: millis
      }
    }
    else {
      action = {
        millis: 500
      }
    }
    // console.log("____-----_", action)
    this.go(action, () => {
      // console.log("YES", callback)
      callback();
    })
  }

  go(action, callback) {
    // console.log(">>>>__", callback)
    setTimeout(() => {
      // console.log("QUINO....__")
      callback();
    }, action.millis);
  }
}

module.exports = { DirWait };