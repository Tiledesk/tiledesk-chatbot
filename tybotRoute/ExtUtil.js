// DEV
const { MessagePipeline } = require('./tiledeskChatbotPlugs/MessagePipeline');
const { DirectivesChatbotPlug } = require('./tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { SplitsChatbotPlug } = require('./tiledeskChatbotPlugs/SplitsChatbotPlug');
const { MarkbotChatbotPlug } = require('./tiledeskChatbotPlugs/MarkbotChatbotPlug');
const { FillParamsChatbotPlug } = require('./tiledeskChatbotPlugs/FillParamsChatbotPlug');
//const { WebhookChatbotPlug } = require('./tiledeskChatbotPlugs/WebhookChatbotPlug');

// PROD
/*const { MessagePipeline } =  require('@tiledesk/tiledesk-chatbot-plugs/MessagePipeline');
const { DirectivesChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/DirectivesChatbotPlug');
const { SplitsChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/SplitsChatbotPlug');
const { MarkbotChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/MarkbotChatbotPlug');
const { WebhookChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/WebhookChatbotPlug');*/

class ExtUtil {

  static async execPipelineExt(request, static_bot_answer, directivesPlug, tdcache, log) {
    const messagePipeline = new MessagePipeline(static_bot_answer, null);
    //const webhookurl = bot.webhook_url;
    //messagePipeline.addPlug(new WebhookChatbotPlug(message.request, webhookurl, token));
    let directivesPlug = new DirectivesChatbotPlug({supportRequest: request, TILEDESK_API_ENDPOINT: APIURL, TILEBOT_ENDPOINT:process.env.TYBOT_ENDPOINT, token: token, log: log, HELP_CENTER_API_ENDPOINT: process.env.HELP_CENTER_API_ENDPOINT, cache: tdcache});
    messagePipeline.addPlug(directivesPlug);
    messagePipeline.addPlug(new FillParamsChatbotPlug(request, tdcache, log)); // in original message
    messagePipeline.addPlug(new SplitsChatbotPlug(log));
    messagePipeline.addPlug(new MarkbotChatbotPlug(log));
    messagePipeline.addPlug(new FillParamsChatbotPlug(request, tdcache, log)); // in splits
    const bot_answer = await messagePipeline.exec();
    if (this.log) {console.log("End pipeline ext, bot_answer:", JSON.stringify(bot_answer));}
    return bot_answer;
  }
  
}

module.exports = { ExtUtil };