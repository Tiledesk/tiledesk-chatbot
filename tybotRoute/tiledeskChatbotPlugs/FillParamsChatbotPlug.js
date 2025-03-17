const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');
const { TiledeskChatbot } = require('../models/TiledeskChatbot.js');
const { Filler } = require('./Filler');
const winston = require('../utils/winston.js');

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
        winston.verbose("(FillParamsChatbotPlug) fillParams disabled.");
        pipeline.nextplug();
        return;
      }
      
      winston.verbose("(FillParamsChatbotPlug) fillParams: true");
      const requestId = this.request.request_id;
      winston.debug("(FillParamsChatbotPlug) all_parameters of requestId: " + requestId)
      const all_parameters = await TiledeskChatbot.allParametersStatic(this.tdcache, requestId);
      winston.debug("(FillParamsChatbotPlug) Got parameters: " + all_parameters);
      if (!all_parameters) {
        pipeline.nextplug();
        return;
      }
      
      const filler = new Filler();
      const filled_message_text = filler.fill(message.text, all_parameters);
      // const filled_message_text = this.fillWithRequestParams(message.text, all_parameters);
      message.text = filled_message_text;
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
        if (commands.length > 1) {
          for (let i = 0; i < commands.length; i++) {
            if (commands[i].type === 'message' && commands[i].message && commands[i].message.text) {
              // let filled_reply = this.fillWithRequestParams(commands[i].message.text, all_parameters);
              let filled_reply = filler.fill(commands[i].message.text, all_parameters);
              commands[i].message.text = filled_reply;
            }
          }
        }
      }
      pipeline.nextplug();
    }
    else {
      winston.debug("(FillParamsChatbotPlug) Fillparams. No message.");
      pipeline.nextplug();
    }
    
  }

  // fillWithRequestParams(message_text, all_parameters) {
  //   if (!message_text) {
  //     return;
  //   }
  //   if (all_parameters) {
  //     for (const [key, value] of Object.entries(all_parameters)) {
  //       // const value = all_parameters[key];
  //       const value_type = typeof value;
  //       message_text = message_text.replace(new RegExp("(\\$\\{" + key + "\\})", 'i'), value);
  //     }
  //   }
  //   return message_text;
  // }
  
}

module.exports = { FillParamsChatbotPlug };