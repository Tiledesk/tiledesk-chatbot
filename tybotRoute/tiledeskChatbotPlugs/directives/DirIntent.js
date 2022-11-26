const { ExtApi } = require('../../ExtApi.js');

class DirIntent {

  constructor(settings) {
    if (!settings.API_ENDPOINT) {
      throw new Error("settings.API_ENDPOINT is mandatory!");
    }
    this.API_ENDPOINT = settings.API_ENDPOINT;
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
      let extEndpoint = `${this.API_ENDPOINT}/modules/tilebot`;
      //if (process.env.TYBOT_ENDPOINT) {
      //  extEndpoint = `${process.env.TYBOT_ENDPOINT}`;
      //}
      const apiext = new ExtApi({
        ENDPOINT: extEndpoint,
        log: true
      });
      if (!message.attributes) {
        message.attributes = {}
      }
      message.attributes.directives = false;
      message.attributes.splitted = true;
      message.attributes.markbot = true;
      if (message.text) {
        //console.log("original message:", message.text);
        message.text = message.text.replace(/\\n/g, "\n");
        //console.log("cr replaced:", message.text);
      }
      console.log("sendSupportMessageExt from dirmessage")
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