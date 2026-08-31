
const { TiledeskChatbotUtil } = require('../../utils/TiledeskChatbotUtil');
const { BaseDirective } = require('../BaseDirective');

class DirClearTranscript extends BaseDirective {

    execute(directive, callback) {
        TiledeskChatbotUtil.clearConversationTranscript(this.context.chatbot, () => {
            this.logger.native("[Clear Transcript] Executed");
            callback();
        });
    }

  }
  
  module.exports = { DirClearTranscript };