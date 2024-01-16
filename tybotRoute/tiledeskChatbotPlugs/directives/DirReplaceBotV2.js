const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { Filler } = require('../Filler');

class DirReplaceBotV2 {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdclient = context.tdclient;
    this.requestId = context.requestId;
    this.log = context.log;
  }

  execute(directive, callback) {
    if (this.log) {console.log("Replacing bot");}
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else if (directive.parameter) {
      let botName = directive.parameter.trim();
      action = {
        botName: botName
      }
    }
    else {
      callback();
    }
    this.go(action, () => {
      callback();
    })
  }

  async go(action, callback) {
    let botName = action.botName;
    let blockName = action.blockName;
    let variables = null;
    variables = 
    await TiledeskChatbot.allParametersStatic(
      this.context.tdcache, this.context.requestId
    );
    const filler = new Filler();
    botName = filler.fill(botName, variables);
    this.tdclient.replaceBotByName(this.requestId, botName, () => {
      if (blockName) {
        if (this.log) {console.log("Sending hidden /start message to bot in dept");}
        const message = {
          type: "text",
          text: blockName,
          attributes : {
            subtype: "info"
          }
        }
        this.tdclient.sendSupportMessage(
          this.requestId,
          message, (err) => {
            if (err) {
              console.error("Error sending hidden message:", err.message);
            }
            if (this.log) {console.log("Hidden message sent.");}
            callback();
        });
      }
      else {
        callback();
      }
    });
  }
}

module.exports = { DirReplaceBotV2 };