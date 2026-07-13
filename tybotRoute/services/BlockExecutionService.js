const winston = require('../utils/winston');
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const { ExtApi } = require('../ExtApi');

class BlockExecutionService {

  /**
   * Run a block in-process (same as POST /exec/:botid) and await completion.
   */
  static async executeBlockInline(options) {
    const {
      chatbot,
      message,
      supportRequest,
      token,
      API_ENDPOINT,
      TILEBOT_ENDPOINT,
      tdcache,
      HELP_CENTER_API_ENDPOINT,
      inlineBlockExec
    } = options;

    if (!chatbot) {
      throw new Error('(BlockExecutionService) chatbot is mandatory');
    }
    if (!message) {
      throw new Error('(BlockExecutionService) message is mandatory');
    }

    message.request = {
      ...(supportRequest || {}),
      ...(message.request || {}),
      bot_id: supportRequest?.bot_id || chatbot.botId,
      request_id: supportRequest?.request_id || chatbot.requestId,
      id_project: supportRequest?.id_project || chatbot.projectId
    };

    winston.info(
      '(BlockExecutionService) Inline exec botId=' + chatbot.botId +
      ' text=' + message.text
    );

    const reply = await chatbot.findBlock(message);
    if (!reply) {
      winston.verbose('(BlockExecutionService) No reply. Stop flow.');
      return;
    }

    if (reply.actions && reply.actions.length > 0) {
      const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');
      const directives = TiledeskChatbotUtil.actionsToDirectives(reply.actions);
      const directivesPlug = new DirectivesChatbotPlug({
        message: message,
        reply: reply,
        directives: directives,
        chatbot: chatbot,
        supportRequest: message.request,
        API_ENDPOINT: API_ENDPOINT,
        TILEBOT_ENDPOINT: TILEBOT_ENDPOINT,
        token: token,
        cache: tdcache,
        HELP_CENTER_API_ENDPOINT: HELP_CENTER_API_ENDPOINT,
        inlineBlockExec: inlineBlockExec !== false
      });

      await new Promise((resolve, reject) => {
        try {
          directivesPlug.processDirectives(() => resolve());
        } catch (error) {
          reject(error);
        }
      });
      return;
    }

    reply.triggeredByMessageId = message._id;
    if (!reply.attributes) {
      reply.attributes = {};
    }
    reply.attributes.directives = true;
    reply.attributes.splits = true;
    reply.attributes.markbot = true;
    reply.attributes.fillParams = true;

    const apiext = new ExtApi({ TILEBOT_ENDPOINT: TILEBOT_ENDPOINT });
    await new Promise((resolve, reject) => {
      apiext.sendSupportMessageExt(
        reply,
        message.request.id_project,
        message.request.request_id,
        token,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

}

module.exports = BlockExecutionService;
