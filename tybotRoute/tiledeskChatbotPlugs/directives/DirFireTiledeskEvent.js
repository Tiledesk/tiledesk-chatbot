const { ExtApi } = require('../../ExtApi.js');

class DirFireTiledeskEvent {

  constructor(config) {
    if (!config.tdclient) {
      throw new Error('config.tdclient (TiledeskClient) object is mandatory.');
    }
    this.tdclient = config.tdclient;
    this.log = config.log;
  }

  execute(directive, callback) {
    if (directive.parameter) {
      const params = this.parseParams(directive.parameter);
      const event_name = params.name;
      const event = {
        name: event_name,
        attributes: params.payload
      }
      this.tdclient.fireEvent(event, function(err, result) {
          if (err) {
              console.error("An error occurred invoking an event:", err);
          }
          callback();
      });
    }
    else {
      if (this.log) {
        console.log("DirFireTiledeskEvent: no parameter");
      }
      callback();
    }
  }

  parseParams(directive_parameter) {
    let name = null;
    let payload = null;
    const params = ms(directive_parameter);
    if (params.n) {
      name = params.n;
    }
    if (params.name) {
      name = params.name;
    }
    if (params.p) {
      payload = params.p;
    }
    if (params.payload) {
      payload = params.payload;
    }
    return {
      name: name,
      payload: payload
    }
  }
}

module.exports = { DirFireTiledeskEvent };