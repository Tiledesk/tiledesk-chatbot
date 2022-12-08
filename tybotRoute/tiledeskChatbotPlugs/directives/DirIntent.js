const { ExtApi } = require('../../ExtApi.js');

class DirIntent {

  constructor(settings) {
    if (!settings.API_ENDPOINT) {
      throw new Error("settings.API_ENDPOINT is mandatory!");
    }
    this.API_ENDPOINT = settings.API_ENDPOINT;
    this.TILEBOT_ENDPOINT = settings.TILEBOT_ENDPOINT;
  }

  execute(directive, message, projectId, requestId, token, callback) {
    if (directive.parameter) {
      let intent_name = directive.parameter.trim();
      let intent_command = "/" + intent_name;
      let intent_command_message = {
        sender: "_tdsender", // bot doesn't reply to "himself" and "system"
        text: intent_command,
        attributes: {
          subtype: "info"
        }
        // request: {
        //   request_id: requestId
        // },
        // id_project: projectId
      };
      // send message to /ext/botId
      // const req_body = {
      //   payload: message_to_bot,
      //   token: token
      // }
      let extEndpoint = `${this.API_ENDPOINT}/modules/tilebot`;
      if (this.TILEBOT_ENDPOINT) {
        extEndpoint = `${this.TILEBOT_ENDPOINT}`;
      }
      const extapi = new ExtApi({
        ENDPOINT: extEndpoint,
        log: true
      });
      console.log("move to intent message:", intent_command_message);
      // console.log("(sending to bot) the req_body:", req_body);
      extapi.sendSupportMessageExt(intent_command_message, projectId, requestId, token, () => {
        console.log("command " + intent_command + " sent.");
        callback();
      });
      // extapi.sendMessageToBot(req_body, message.attributes.intent_info.botId, token, () => {
      //   console.log("sendMessageToBot() req_body sent:", req_body);
      //   callback();
      // });
    }
    else {
      callback();
    }
  }
}

module.exports = { DirIntent };