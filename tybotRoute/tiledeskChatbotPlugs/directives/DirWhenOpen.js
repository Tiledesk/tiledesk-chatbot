
class DirWhenOpen {

  constructor(config) {
    if (!config.tdclient) {
      throw new Error('config.tdclient (TiledeskClient) object is mandatory.');
    }
    this.tdclient = config.tdclient;
    if (config.checkOpen === null || config.checkOpen === true) {
      // null => defaults to checkOpen
      this.checkOpen = true;  
    }
    else {
      this.checkOpen = false;
    }
  }

  execute(directive, directives, current_directive_index, callback) {
    this.tdclient.openNow((err, result) => {
      if (err) {
        console.error("Agent in DirOfflineHours Error:", err);
        callback();
      }
      else {
        if (directive.parameter) {
          const exec_dir = directive.parameter;
          if (result && result.isopen && this.checkOpen) {
            // execute the action on "open"
            // action = directive.parameter
            // directives.slice(current_directive_index, action)
            callback();
          }
          if (result && result.isopen && this.checkClosed) {
            // execute the action on "closed"
          }
          else {
            callback();
          }
        }
      }
    });
  }

  directiveFromParameter(parameter) {
    const directive_pattern = /((\\{1}_td[a-zA-Z_0-9]*)|(\\agent))[ ]*(.*)[\r\n]*/m;
    let match = null;
    let directive = null;
    match = directive_pattern.exec(parameter);
  }
}

module.exports = { DirWhenOpen };