
const { Logger } = require('../../Logger');
const { TiledeskChatbotUtil } = require('../../utils/TiledeskChatbotUtil');

class DirClearTranscript {

    constructor(context) {
        if (!context) {
            throw new Error('context object is mandatory.');
        }
        this.context = context;
        this.requestId = context.requestId;
        
        this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
    }
    
    execute(directive, callback) {
        this.logger.info("[Clear Transcript] Executing action");
        TiledeskChatbotUtil.clearConversationTranscript(this.context.chatbot, () => {
            this.logger.info("[Clear Transcript] Action completed");
            callback();
        });
    }

  }
  
  module.exports = { DirClearTranscript };