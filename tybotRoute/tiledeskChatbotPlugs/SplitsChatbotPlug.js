const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');

class SplitsChatbotPlug {

  
/**
   * @example
   * const { SplitsChatbotPlug } = require('./SplitsChatbotPlug');
   * 
   */

  constructor(log) {
    this.log = log;
  }

  exec(pipeline) {
    let message = pipeline.message;
    if (message.attributes && (message.attributes.splits == undefined || message.attributes.splits == false)) { // defaults to disabled
      if (this.log) {
        console.log("Splits disabled.");
      }
      pipeline.nextplug();
      return;
    }
    if (this.log) {
      console.log("Splitting...")
    }
    // if splits found just a attributs.commands payload is attached
    // to the original json message with split commands
    let commands = TiledeskChatbotUtil.splitPars(message.text);
    if (this.log) {
      console.log("commands", commands)
    }
    if (commands && commands.length > 1) {
      if (!message.attributes) {
        message.attributes = {}
      }
      message.attributes.commands = commands;
    }
    if (this.log) {
      console.log("Message out of Splits plugin:", JSON.stringify(message));
    }
    pipeline.nextplug();
  }
}

module.exports = { SplitsChatbotPlug };