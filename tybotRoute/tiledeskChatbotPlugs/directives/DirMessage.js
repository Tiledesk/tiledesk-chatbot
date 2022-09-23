const { ExtApi } = require('../../ExtApi.js');

class DirMessage {

  constructor() {
  }

  execute(directive, projectId, requestId, token, callback) {
    if (directive.parameter) {
      let text = directive.parameter.trim();
      let message = {text: text};
      if (text.lastIndexOf("\\hide") >= 0) {
        //console.log("HIDDEN");
        message.text = text.slice(0, text.lastIndexOf("\\hide")).trim();
        message.attributes = {
          subtype: "info"
        }
      }
      //console.log("Message:", message);
      let extEndpoint = `${process.env.API_ENDPOINT}/modules/tilebot/`;
      if (process.env.TYBOT_ENDPOINT) {
        extEndpoint = `${process.env.TYBOT_ENDPOINT}`;
      }
      const apiext = new ExtApi({
        ENDPOINT: extEndpoint
      });
      if (!message.attributes) {
        message.attributes = {}
      }
      message.attributes.directives = false;
      message.attributes.splitted = false;
      message.attributes.markbot = true;
      if (message.text) {
        //console.log("original message:", message.text);
        message.text = message.text.replace("\\n", "\n");
        //console.log("cr replaced:", message.text);
      }
      apiext.sendSupportMessageExt(
        message,
        projectId,
        requestId,
        token,
        () => {
          if (this.log) {console.log("Ext message sent.");}
          callback();
      });
    }
  }
}

module.exports = { DirMessage };