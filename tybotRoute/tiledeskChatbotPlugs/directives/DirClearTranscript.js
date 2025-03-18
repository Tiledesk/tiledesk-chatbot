
const { TiledeskChatbotUtil } = require('../../utils/TiledeskChatbotUtil');

class DirClearTranscript {

    constructor(context) {
        if (!context) {
            throw new Error('context object is mandatory.');
        }
        this.context = context;
        this.requestId = context.requestId;
    }
    
    execute(directive, callback) {
        TiledeskChatbotUtil.clearConversationTranscript(this.context.chatbot, () => {
            callback();
        });
    }

  }
  
  module.exports = { DirClearTranscript };