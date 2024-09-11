
const { TiledeskChatbotUtil } = require('../../models/TiledeskChatbotUtil');

class DirClearTranscript {

    constructor(context) {
        if (!context) {
            throw new Error('context object is mandatory.');
        }
        this.context = context;
        this.tdclient = context.tdclient;
        this.requestId = context.requestId;
    }
    
    execute(directive, callback) {
        TiledeskChatbotUtil.clearConversationTranscript(this.context.chatbot, () => {
            callback();
        });
    }

  }
  
  module.exports = { DirClearTranscript };