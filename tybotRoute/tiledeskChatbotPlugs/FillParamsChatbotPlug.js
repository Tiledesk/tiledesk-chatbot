const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');
const { TiledeskChatbot } = require('../models/TiledeskChatbot.js');

class FillParamsChatbotPlug {

/**
   * @example
   * const { FillParamsChatbotPlug } = require('./FillParamsChatbotPlug');
   * 
   */

  constructor(request, tdcache, log) {
    this.log = log;
    this.tdcache = tdcache;
    this.request = request;
  }

  async exec(pipeline) {
    let message = pipeline.message;
    if (message) {
      if (message.attributes && (message.attributes.fillParams == undefined || message.attributes.fillParams == false)) { // defaults to disabled
        if (this.log) {console.log("fillParams disabled.");}
        pipeline.nextplug();
        return;
      }
      if (this.log) {
        console.log("fillParams: true");
      }
      const requestId = this.request.request_id;
      if (this.log) {console.log("all_parameters of requestId:", requestId)}
      const all_parameters = await TiledeskChatbot.allParametersStatic(this.tdcache, requestId);
      if (this.log) {console.log("--got parameters", all_parameters);}
      if (!all_parameters) {
        pipeline.nextplug();
        return;
      }
      const filled_message_text = this.fillWithRequestParams(message.text, all_parameters);
      message.text = filled_message_text;
      //console.log("message filled_message_text:", message)
      if (!message.attributes) {
        message.attributes = {}
      }
      // Reserved names: userEmail, userFullname (and firstMessage)
      if (all_parameters['userEmail']) {
         message.attributes.updateUserEmail = all_parameters['userEmail'];
      }
      if (all_parameters['userFullname']) {
        message.attributes.updateUserFullname = all_parameters['userFullname'];
      }
  
      if (message.attributes && message.attributes.commands) {
        let commands = message.attributes.commands;
        // if (this.log) {console.log("commands for fillMessage:", JSON.stringify(commands));}
        if (commands.length > 1) {
          for (let i = 0; i < commands.length; i++) {
            if (commands[i].type === 'message' && commands[i].message && commands[i].message.text) {
              let filled_reply = this.fillWithRequestParams(commands[i].message.text, all_parameters);
              commands[i].message.text = filled_reply;
            }
          }
        }
      }
      pipeline.nextplug();
    }
    else {
      if (this.log) {console.log("Fillparams. No message.");}
      pipeline.nextplug();
    }
    
  }

  fillWithRequestParams(message_text, all_parameters, requestId) {
    if (this.log) {console.log("collected parameters:", all_parameters);}
    if (all_parameters) {
      for (const [key, value] of Object.entries(all_parameters)) {
        if (this.log) {console.log("checking parameter", key)}
        message_text = message_text.replace(new RegExp("(\\$\\{" + key + "\\})", 'i'), all_parameters[key]);
      }
      if (this.log) {console.log("final:", message_text);}
    }
    return message_text;
  }
  
}

module.exports = { FillParamsChatbotPlug };