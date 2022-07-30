const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');

class SplitsChatbotPlug {

  
/**
   * @example
   * const { SplitsChatbotPlug } = require('./SplitsChatbotPlug');
   * 
   */

  constructor() {
  }

  exec(pipeline) {
    let message = pipeline.message;
    if (message.attributes && message.attributes.splits && message.attributes.splits == false) {
      completionCallback(message);
      return;
    }
    console.log("Splitting...")
    // if splits found just a attributs.commands payload is attached
    // to the original json message with split commands
    let commands = TiledeskChatbotUtil.splitPars(message.text);
    console.log("commands", commands)
    if (commands && commands.length > 1) {
      if (!message.attributes) {
        message.attributes = {}
      }
      message.attributes.commands = commands;
    }
    console.log("Message out of Splits plugin:", JSON.stringify(message));
    pipeline.nextplug();
    //next(pipeline, completionCallback);
  }

  next(pipeline, completionCallback) {
    const plug = pipeline.nextplug();
    if (!plug) {
      completionCallback();
    }
    else {
      plug.exec(pipeline);
    }
  }
}

module.exports = { SplitsChatbotPlug };