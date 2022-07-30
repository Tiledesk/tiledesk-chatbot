const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');

class MarkbotChatbotPlug {

  
/**
   * @example
   * const { MarkbotChatbotPlug } = require('./MarkbotChatbotPlug');
   * 
   */

  constructor() {
  }

  exec(pipeline) {
    let message = pipeline.message;
    console.log("markbot, message.attributes", message.attributes)
    if (message.attributes && message.attributes.markbot != undefined && message.attributes.markbot == false) {
      console.log("markbot disabled")
      pipeline.nextplug();
      return;
    }
    // the legacy 'microlanguage' command
    /*if (message.attributes && message.attributes.microlanguage != undefined && message.attributes.microlanguage == false) {
      console.log("microlanguage disabled");
      pipeline.nextplug();
      return;
    }*/
    
    if (!message.attributes) {
      message.attributes = {}
    }
    
    if (message.text) {
      console.log("markbotting main message...");
      let parsed_reply = TiledeskChatbotUtil.parseReply(message.text);
      console.log("parsed", JSON.stringify(parsed_reply));
      if (parsed_reply) {
        message.text = parsed_reply.message.text;
        message.type = parsed_reply.message.type;
        message.metadata = parsed_reply.message.metadata;
        console.log("parsed_reply.message.attributes", parsed_reply.message.attributes);
        if (parsed_reply.message.attributes) {
          for(const [key, value] of Object.entries(parsed_reply.message.attributes)) {
            console.log("key:", key)
            console.log("value:", value)
            
            message.attributes[key] = value;
          }
        }
        //message.attributes.attachment = parsed_reply.message.attributes.attachment;  
      }
    }
    
    if (message.attributes && message.attributes.commands) {
      let commands = message.attributes.commands;
      console.log("commands for markbot:", commands);
      if (commands.length > 1) {
        for (let i = 0; i < commands.length; i++) {
          if (commands[i].type === 'message' && commands[i].message && commands[i].message.text) {
            let parsed_reply = TiledeskChatbotUtil.parseReply(commands[i].message.text);
            //console.log("PARSED***", parsed_reply);
            commands[i].message = parsed_reply.message;
          }
        }
      }
    }
    console.log("Message out of Markbot:", JSON.stringify(message));
    pipeline.nextplug(pipeline);
    
  }
  
/*
  next(pipeline, completionCallback) {
    const plug = pipeline.nextplug();
    if (!plug) {
      completionCallback();
    }
    else {
      plug.exec(pipeline);
    }
  }*/
}

module.exports = { MarkbotChatbotPlug };