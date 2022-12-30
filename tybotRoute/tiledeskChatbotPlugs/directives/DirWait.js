
class DirWait {

  constructor() {
  }

  execute(directive, callback) {
    //  500ms < wait-time < 10.000ms
    let millis = 1000;
    if (directive.parameter) {
      const _millis = parseInt(directive.parameter.trim());
      if (!Number.isNaN(millis)) {
        millis = _millis;
      }
      if (millis > 15000) {
        millis = 15000
      }
      else if (millis < 1000) {
        millis = 1000
      }
    }
    setTimeout(() => {
      callback();
    }, millis);
  }
}

module.exports = { DirWait };