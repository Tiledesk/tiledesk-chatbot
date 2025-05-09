const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');
const winston = require('../utils/winston')

class SplitsChatbotPlug {

  
/**
   * @example
   * const { SplitsChatbotPlug } = require('./SplitsChatbotPlug');
   * 
   */

  constructor() {}

  exec(pipeline) {
    let message = pipeline.message;
    if (message.attributes && (message.attributes.splits == undefined || message.attributes.splits == false)) { // defaults to disabled
      winston.verbose("(SplitsChatbotPlug) Splits disabled.");
      pipeline.nextplug();
      return;
    }
    if (!message.text) {
      pipeline.nextplug();
      return;
    }
    winston.verbose("(SplitsChatbotPlug) Splitting...");
    // if splits found just a attributs.commands payload is attached
    // to the original json message with split commands
    let commands = TiledeskChatbotUtil.splitPars(message.text);
    winston.debug("(SplitsChatbotPlug) commands", commands)
    if (commands && commands.length > 1) {
      if (!message.attributes) {
        message.attributes = {}
      }
      message.attributes.commands = commands;
    }
    pipeline.nextplug();
  }
}

module.exports = { SplitsChatbotPlug };