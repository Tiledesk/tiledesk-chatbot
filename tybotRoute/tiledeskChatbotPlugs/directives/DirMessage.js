const { ExtApi } = require('../../ExtApi.js');

class DirMessage {

  constructor(settings) {
    if (!settings.API_ENDPOINT) {
      throw new Error("settings.API_ENDPOINT is mandatory!");
    }
    this.API_ENDPOINT = settings.API_ENDPOINT;
    this.TILEBOT_ENDPOINT = settings.TILEBOT_ENDPOINT;
    this.projectId = settings.projectId;
    this.requestId = settings.requestId;
    this.token = settings.token;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action;
      if (action.message) {
        if (!action.message.attributes) {
          action.message.attributes = {}
        }
        action.message.attributes.directives = false;
        action.message.attributes.splits = false;
        action. message.attributes.markbot = false;
        // // temp patch for a fix in the future
        // if (!action.message.text || action.message.text.trim() == "") {
        //   action.message.text = "Text field was empty"
        // }
      }
    }
    else if (directive.parameter) {
      let text = directive.parameter.trim();
      action = {
        message: {
          text: text,
          attributes: {
            directives: false,
            splits: true,
            markbot: true
          }
        }
      }
    }
    this.go(action, () => {
      callback();
    });
  }

  go(action, callback) {
    const message = action.message;
    if (this.log) {console.log("Message to extEndpoint:", message)};
    let extEndpoint = `${this.API_ENDPOINT}/modules/tilebot`;
    if (this.TILEBOT_ENDPOINT) {
      extEndpoint = `${this.TILEBOT_ENDPOINT}`;
    }
    const apiext = new ExtApi({
      ENDPOINT: extEndpoint,
      log: false
    });
    if (message.text) {
      message.text = message.text.replace(/\\n/g, "\n");
    }
    // message.text = "Ciao1\n\nCIao2"
    // console.log("sendSupportMessageExt from dirmessage", message);
    apiext.sendSupportMessageExt(
      message,
      this.projectId,
      this.requestId,
      this.token,
      () => {
        if (this.log) {console.log("Ext message sent.");}
        callback();
    });
  }

}

module.exports = { DirMessage };