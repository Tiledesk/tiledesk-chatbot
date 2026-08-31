
const { TiledeskChatbotUtil } = require('../../../utils/TiledeskChatbotUtil');
const { BaseDirective } = require('../../BaseDirective');
const { Directives } = require('../Directives');

class DirClearTranscript extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.CLEAR_TRANSCRIPT];

    execute(directive, callback) {
        TiledeskChatbotUtil.clearConversationTranscript(this.context.chatbot, () => {
            this.logger.native("[Clear Transcript] Executed");
            callback();
        });
    }

  }
  
  module.exports = { DirClearTranscript };