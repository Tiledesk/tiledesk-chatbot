// DEV
const { MessagePipeline } = require('./tiledeskChatbotPlugs/MessagePipeline');
const { DirectivesChatbotPlug } = require('./tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { SplitsChatbotPlug } = require('./tiledeskChatbotPlugs/SplitsChatbotPlug');
const { MarkbotChatbotPlug } = require('./tiledeskChatbotPlugs/MarkbotChatbotPlug');
const { FillParamsChatbotPlug } = require('./tiledeskChatbotPlugs/FillParamsChatbotPlug');
//const { WebhookChatbotPlug } = require('./tiledeskChatbotPlugs/WebhookChatbotPlug');

// PROD
/*const { MessagePipeline } =  require('@tiledesk/tiledesk-chatbot-plugs/MessagePipeline');
const { SplitsChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/SplitsChatbotPlug');
const { MarkbotChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/MarkbotChatbotPlug');
const { WebhookChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/WebhookChatbotPlug');*/

class ExtUtil {

  static async execPipelineExt(request, static_bot_answer, directivesPlug, tdcache) {
    const messagePipeline = new MessagePipeline(static_bot_answer, null);
    messagePipeline.addPlug(directivesPlug);
    messagePipeline.addPlug(new FillParamsChatbotPlug(request, tdcache)); // in original message
    messagePipeline.addPlug(new SplitsChatbotPlug());
    messagePipeline.addPlug(new MarkbotChatbotPlug());
    messagePipeline.addPlug(new FillParamsChatbotPlug(request, tdcache)); // in splits
    const bot_answer = await messagePipeline.exec();
    return bot_answer;
  }
  
}

module.exports = { ExtUtil };