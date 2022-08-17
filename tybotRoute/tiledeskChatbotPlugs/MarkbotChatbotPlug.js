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
    //console.log("markbot, message.attributes", message.attributes)
    if (message.attributes && (message.attributes.markbot == undefined || message.attributes.markbot == false)) { // defaults to disabled
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
        if (!message.type || message.type === "text") {
          // if message type != text the message already provided his own type (i.e. "image"). Only messages of type == text can be modified by markbot to change their type.
          message.type = parsed_reply.message.type;
        }
        if (!message.metadata) {
          // if already present, do not modify metadata
          message.metadata = parsed_reply.message.metadata;
        }
        console.log("parsed_reply.message.attributes", parsed_reply.message.attributes);
        //this.mergeCurrentMessageButtons(message, parsed_reply);
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

  /*mergeCurrentMessageButtons(message, parsed_reply) {
    if (message && message.attributes && message.attributes.attachment && message.attributes.attachment.buttons) {
      if (parsed_reply && parsed_reply.attributes && parsed_reply.attributes.attachment && parsed_reply.attributes.attachment.buttons) {
        message.attributes.attachment.buttons.forEach(b => {
          parsed_reply.attributes.attachment.buttons.push(b);
        });
      }
    }
  }*/
  
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