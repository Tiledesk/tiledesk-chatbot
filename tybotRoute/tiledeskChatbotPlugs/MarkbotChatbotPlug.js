const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');

class MarkbotChatbotPlug {

  
/**
   * @example
   * const { MarkbotChatbotPlug } = require('./MarkbotChatbotPlug');
   * 
   */

  constructor(log) {
    this.log = log;
  }

  exec(pipeline) {
    let message = pipeline.message;
    // console.log("markbot on message", message)
    if (message.attributes && (message.attributes.markbot == undefined || message.attributes.markbot == false)) { // defaults to disabled
      if (this.log) {console.log("markbot disabled")}
      pipeline.nextplug();
      return;
    }

    let incoming_message_text = message.text.trim();

    let commands = null;
    if (message.attributes && message.attributes.commands) {
      commands = message.attributes.commands;
    }
    // console.log("before taking decision:");
    // console.log("message.text:", incoming_message_text);
    // console.log("message commands:", commands)
    if (incoming_message_text === "" && !commands) {
      // console.log("message with no content. Ignoring");
      pipeline.message = null;
      pipeline.nextplug();
      return;
    }

    if (!message.attributes) {
      message.attributes = {}
    }
    if (incoming_message_text !== "") {
      if (this.log) {console.log("markbotting main message...");}
      let parsed_reply = TiledeskChatbotUtil.parseReply(incoming_message_text);
      if (this.log) {console.log("parsed", JSON.stringify(parsed_reply));}
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
        if (this.log) {console.log("parsed_reply.message.attributes", parsed_reply.message.attributes);}
        //this.mergeCurrentMessageButtons(message, parsed_reply);
        if (parsed_reply.message.attributes) {
          for(const [key, value] of Object.entries(parsed_reply.message.attributes)) {
            message.attributes[key] = value;
          }
        }
      }
    }
    else {
      console.log("no message text:", message.text);
    }
    
    // let commands = null;
    // if (message.attributes && message.attributes.commands) {
    //   commands = message.attributes.commands;
    if (commands) {
      if (this.log) {console.log("commands for markbot:", commands);}
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
    // else if (message.attributes && !message.attributes.commands) {
    //   console.log("no message commands.");
    // }
    if (this.log) {console.log("Message out of Markbot:", JSON.stringify(message));}
    pipeline.nextplug();
    
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