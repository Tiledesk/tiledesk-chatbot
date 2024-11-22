const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const ms = require('minimist-string');

class DirFireTiledeskEvent {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }

    this.context = context;
    this.log = context.log;

    this.API_ENDPOINT = context.API_ENDPOINT;
    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___",
      log: this.log
    });
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