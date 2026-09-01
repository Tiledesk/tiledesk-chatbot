const winston = require('../utils/winston.js');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { ExtApi } = require('../pipeline/ExtApi.js');
const { ExtUtil } = require('../pipeline/ExtUtil.js');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot.js');
const { AnalyticsClient } = require('../observability/AnalyticsClient.js');
const { MongodbBotsDataSource } = require('../engine/MongodbBotsDataSource.js');
const { MockBotsDataSource } = require('../engine/mock/MockBotsDataSource.js');
const { IntentsMachineFactory } = require('../engine/IntentsMachineFactory.js');
const { DirectivesChatbotPlug } = require('../pipeline/plugs/DirectivesChatbotPlug');
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil.js');
const { runtimeContext } = require('./runtimeContext.js');
const endpoints = require('../config/endpoints.js');

/**
 * Conversation-driving routes: the webhook Tiledesk calls on every message,
 * the direct block execution entry point and the "ext" message pipeline.
 * Extracted verbatim from tybotRoute/index.js (Phase 6a).
 */
function registerMessageRoutes(router) {

router.post('/ext/:botid', async (req, res) => {
  const botId = req.params.botid;
  winston.verbose("(tybotRoute) POST /ext/:botid called: " + botId)

  if(!botId || botId === "null" || botId === "undefined"){
    return res.status(400).send({"success": false, error: "Required parameters botid not found. Value is 'null' or 'undefined'"})
  }

  if (req && req.body && req.body.payload && req.body.payload.request && req.body.payload.request.snapshot) {
    delete req.body.payload.request.snapshot;
  }
  winston.verbose("(tybotRoute) Request Body: ", req.body);

  const message = req.body.payload;
  const messageId = message._id;
  //const faq_kb = req.body.hook; now it is "bot"
  const token = req.body.token;
  const requestId = message.request.request_id;
  const projectId = message.id_project;
  winston.verbose("(tybotRoute) message.id_project: " + message.id_project)

  // adding info for internal context workflow
  message.request.bot_id = botId;
  if (message.request.id_project === null || message.request.id_project === undefined) {
    message.request.id_project = projectId;
  }

  //skip internal note messages
  if(message && message.attributes && message.attributes.subtype === 'private') {
    winston.verbose("(tybotRoute) Skipping internal note message: " + message.text);
    return res.status(200).send({"success":true});
  }

  // validate reuqestId
  let isValid = TiledeskChatbotUtil.validateRequestId(requestId, projectId);
  if (isValid) {
    res.status(200).send({"success":true});
  }
  else {
    res.status(400).send({"success": false, error: "Request id is invalid:" + requestId + " for projectId:" + projectId + "chatbotId:" + botId});
    return;
  }

  const request_botId_key = "tilebot:botId_requests:" + requestId;
  await runtimeContext.tdcache.set(
    request_botId_key,
    botId,
    {EX: 604800} // 7 days
  );

  let botsDS;
  if (!runtimeContext.staticBots) {
    botsDS = new MongodbBotsDataSource({projectId: projectId, botId: botId});
    winston.verbose("(tybotRoute) botsDS created with Mongo");
  }
  else {
    botsDS = new MockBotsDataSource(runtimeContext.staticBots);
  }
  
  // get the bot metadata
  // A failed lookup must stop this message. The previous
  // `.catch((err) => { Promise.reject(err); return; })` built a NEW rejected
  // promise nobody awaited (unhandled rejection #1) and its `return` only left
  // the arrow function, so the handler carried on with `bot === undefined` and
  // `new TiledeskChatbot({... bot: undefined ...})` threw "config.bot is
  // mandatory" inside the async handler (unhandled rejection #2).
  let bot;
  try {
    bot = await botsDS.getBotByIdCache(botId, runtimeContext.tdcache);
  }
  catch (err) {
    winston.error("(tybotRoute) Error getting the bot " + botId + ": ", err);
    return;
  }
  
  let intentsMachine;
  let backupMachine;
  if (!runtimeContext.staticBots) {
    intentsMachine = IntentsMachineFactory.getMachine(bot, botId, projectId);
    backupMachine = IntentsMachineFactory.getBackupMachine(bot, botId, projectId);
    winston.debug("(tybotRoute) Created backupMachine:", backupMachine)
  }
  else {
    intentsMachine = {}
  }

  const chatbot = new TiledeskChatbot({
    botsDataSource: botsDS,
    intentsFinder: intentsMachine,
    backupIntentsFinder: backupMachine,
    botId: botId,
    bot: bot,
    token: token,
    APIURL: runtimeContext.API_ENDPOINT,
    APIKEY: "___",
    tdcache: runtimeContext.tdcache,
    requestId: requestId,
    projectId: projectId,
    MAX_STEPS: runtimeContext.MAX_STEPS,
    MAX_EXECUTION_TIME: runtimeContext.MAX_EXECUTION_TIME
  });
  winston.verbose("(tybotRoute) Message text: " + message.text)
  
  try {
    await TiledeskChatbotUtil.updateRequestAttributes(chatbot, token, message, projectId, requestId);
    if (requestId.startsWith("support-group-")) {
      await TiledeskChatbotUtil.updateConversationTranscript(chatbot, message);
    }
  } catch (e) {
    winston.error("Error on /ext updating request attributes or transcript: ", e)
    return;
  }

  let reply = null;
  try {
    reply = await chatbot.replyToMessage(message);
  }
  catch(err) {
    winston.error("(tybotRoute) An error occurred replying to message: ", err);
    return;
  }
  if (!reply) {
    winston.verbose("(tybotRoute) No reply. Stop flow.")
    return;
  }
  
  if (reply.actions && reply.actions.length > 0) { // structured actions (coming from chatbot designer)
    let directivesSuccess = true;
    try {
      winston.debug("(tybotRoute) Reply actions: ", reply.actions)
      let directives = TiledeskChatbotUtil.actionsToDirectives(reply.actions);
      winston.debug("(tybotRoute) the directives:", directives)
      let directivesPlug = new DirectivesChatbotPlug(
        {
          message: message,
          reply: reply,
          directives: directives,
          chatbot: chatbot,
          supportRequest: message.request,
          API_ENDPOINT: runtimeContext.API_ENDPOINT,
          TILEBOT_ENDPOINT:runtimeContext.TILEBOT_ENDPOINT,
          token: token,
          // HELP_CENTER_API_ENDPOINT: process.env.HELP_CENTER_API_ENDPOINT,
          cache: runtimeContext.tdcache
        }
      );
      directivesPlug.processDirectives( () => {
        winston.verbose("(tybotRoute) Actions - Directives executed.");
      });
    }
    catch (error) {
      directivesSuccess = false;
      winston.error("(tybotRoute) Error while processing actions:", error);
    }

    // Only track published (production) runs: the root/draft copy has no root_id,
    // so draft/test executions are intentionally excluded from analytics.
    if (chatbot._intentStartTime && bot.root_id) {
      const intentDuration = Date.now() - chatbot._intentStartTime;
      AnalyticsClient.track('agent.intent_completed', projectId, {
        agent_id:    bot.root_id,
        intent_id:   chatbot._lastIntentId || '',
        intent_name: reply.attributes?.intent_info?.intent_name || 'unknown',
        duration_ms: intentDuration,
        success:     directivesSuccess,
        request_id:  requestId || null
      });
    }
  }
  else { // text answer (parse text directives to get actions)
    winston.verbose("(tybotRoute) No actions. Reply text: ", reply.text)
    reply.triggeredByMessageId = messageId;
    if (!reply.attributes) {
      reply.attributes = {}
    }
    reply.attributes.directives = true;
    reply.attributes.splits = true;
    reply.attributes.markbot = true;
    reply.attributes.fillParams = true;
    
    const apiext = new ExtApi({
      TILEBOT_ENDPOINT: runtimeContext.TILEBOT_ENDPOINT
    });
    apiext.sendSupportMessageExt(reply, projectId, requestId, token, () => {
      winston.verbose("(tybotRoute) sendSupportMessageExt reply sent: ", reply)
    });

    // Only track published (production) runs: the root/draft copy has no root_id,
    // so draft/test executions are intentionally excluded from analytics.
    if (chatbot._intentStartTime && bot.root_id) {
      const intentDuration = Date.now() - chatbot._intentStartTime;
      AnalyticsClient.track('agent.intent_completed', projectId, {
        agent_id:    bot.root_id,
        intent_id:   chatbot._lastIntentId || '',
        intent_name: reply.attributes?.intent_info?.intent_name || 'unknown',
        duration_ms: intentDuration,
        success:     true,
        request_id:  requestId || null
      });
    }
  }

});

router.post('/exec/:botid', async (req, res) => {
  // NOTE (analytics): This route executes a named block directly via findBlock() and has no
  // intent context. agent.intent_matched / agent.intent_completed are intentionally NOT emitted
  // here. Only agent.block_executed (and related events) may be emitted by DirectivesChatbotPlug
  // for individual directives inside the block.

  const botId = req.params.botid;
  winston.verbose("(tybotRoute) POST /exec/:botid called: " + botId);
  if(!botId || botId === "null" || botId === "undefined"){
    return res.status(400).send({"success": false, error: "Required parameters botid not found. Value is 'null' or 'undefined'"})
  }

  if (req && req.body && req.body.payload && req.body.payload.request && req.body.payload.request.snapshot) {
    delete req.body.payload.request.snapshot;
  }
  winston.verbose("(tybotRoute) Request Body: ", req.body);

  const message = req.body.payload;
  const messageId = message._id;
  const token = req.body.token;
  const requestId = message.request.request_id;
  const projectId = message.id_project;
  winston.verbose("(tybotRoute) message.id_project: " + message.id_project)

  // adding info for internal context workflow
  message.request.bot_id = botId;
  if (message.request.id_project === null || message.request.id_project === undefined) {
    message.request.id_project = projectId;
  }

  //skip internal note messages
  if(message && message.attributes && message.attributes.subtype === 'private') {
    winston.verbose("(tybotRoute) Skipping internal note message: " + message.text);
    return res.status(200).send({"success":true});
  }

  // validate reuqestId
  let isValid = TiledeskChatbotUtil.validateRequestId(requestId, projectId);
  if (isValid) {
    res.status(200).send({"success":true});
  }
  else {
    res.status(400).send({"success": false, error: "Request id is invalid:" + requestId + " for projectId:" + projectId + "chatbotId:" + botId});
    return;
  }

  const request_botId_key = "tilebot:botId_requests:" + requestId;
  await runtimeContext.tdcache.set(
    request_botId_key,
    botId,
    {EX: 604800} // 7 days
  );

  let botsDS;
  if (!runtimeContext.staticBots) {
    botsDS = new MongodbBotsDataSource({projectId: projectId, botId: botId});
    winston.verbose("(tybotRoute) botsDS created with Mongo");
  }
  else {
    botsDS = new MockBotsDataSource(runtimeContext.staticBots);
  }

  // get the bot metadata
  // A failed lookup must stop this message. The previous
  // `.catch((err) => { Promise.reject(err); return; })` built a NEW rejected
  // promise nobody awaited (unhandled rejection #1) and its `return` only left
  // the arrow function, so the handler carried on with `bot === undefined` and
  // `new TiledeskChatbot({... bot: undefined ...})` threw "config.bot is
  // mandatory" inside the async handler (unhandled rejection #2).
  let bot;
  try {
    bot = await botsDS.getBotByIdCache(botId, runtimeContext.tdcache);
  }
  catch (err) {
    winston.error("(tybotRoute) Error getting the bot " + botId + ": ", err);
    return;
  }

  let intentsMachine;
  let backupMachine;

  const chatbot = new TiledeskChatbot({
    botsDataSource: botsDS,
    intentsFinder: intentsMachine,
    backupIntentsFinder: backupMachine,
    botId: botId,
    bot: bot,
    token: token,
    APIURL: runtimeContext.API_ENDPOINT,
    APIKEY: "___",
    tdcache: runtimeContext.tdcache,
    requestId: requestId,
    projectId: projectId,
    MAX_STEPS: runtimeContext.MAX_STEPS,
    MAX_EXECUTION_TIME: runtimeContext.MAX_EXECUTION_TIME
  });
  winston.verbose("(tybotRoute) Message text: " + message.text);

  let reply = null;
  try {
    reply = await chatbot.findBlock(message);
  } 
  catch (err) {
    winston.error("(tybotRoute) An error occurred replying to message: ", err);
    return;
  }
  if (!reply) {
    winston.verbose("(tybotRoute) No reply. Stop flow.")
    return;
  }

  if (reply.actions && reply.actions.length > 0) { // structured actions (coming from chatbot designer)
    try {
      winston.debug("(tybotRoute) Reply actions: ", reply.actions)
      let directives = TiledeskChatbotUtil.actionsToDirectives(reply.actions);
      winston.debug("(tybotRoute) the directives:", directives)
      let directivesPlug = new DirectivesChatbotPlug(
        {
          message: message,
          reply: reply,
          directives: directives,
          chatbot: chatbot,
          supportRequest: message.request,
          API_ENDPOINT: runtimeContext.API_ENDPOINT,
          TILEBOT_ENDPOINT:runtimeContext.TILEBOT_ENDPOINT,
          token: token,
          // HELP_CENTER_API_ENDPOINT: process.env.HELP_CENTER_API_ENDPOINT,
          cache: runtimeContext.tdcache
        }
      );
      directivesPlug.processDirectives( () => {
        winston.verbose("(tybotRoute) Actions - Directives executed.");
      });
    }
    catch (error) {
      winston.error("(tybotRoute) Error while processing actions:", error);
    }
  }
  else { // text answer (parse text directives to get actions)
    winston.verbose("(tybotRoute) No actions. Reply text: ", reply.text)
    reply.triggeredByMessageId = messageId;
    if (!reply.attributes) {
      reply.attributes = {}
    }
    reply.attributes.directives = true;
    reply.attributes.splits = true;
    reply.attributes.markbot = true;
    reply.attributes.fillParams = true;
    
    const apiext = new ExtApi({
      TILEBOT_ENDPOINT: runtimeContext.TILEBOT_ENDPOINT
    });
    apiext.sendSupportMessageExt(reply, projectId, requestId, token, () => {
      winston.verbose("(tybotRoute) sendSupportMessageExt reply sent: ", reply)
    });
  }

})

router.post('/ext/:projectId/requests/:requestId/messages', async (req, res) => {
  res.json({success:true});
  const projectId = req.params.projectId;
  const requestId = req.params.requestId;
  const token = req.headers["authorization"];

  winston.verbose("(tybotRoute) POST /ext/:projectId/requests/:requestId/messages called: " + requestId)
  winston.debug("(tybotRoute) projectId " + projectId)
  winston.debug("(tybotRoute) token " + token)
  winston.debug("(tybotRoute) req.headers " + req.headers)
  winston.debug("(tybotRoute) projectId " + projectId)
  
  let answer = req.body;
  winston.verbose("(tybotRoute) answer on sendSupportMessageExt: ", answer);
  const tdclient = new TiledeskClient({
    projectId: projectId,
    token: token,
    APIURL: runtimeContext.API_ENDPOINT,
    APIKEY: "___"
  });

  let request;
  try {
    request = await tdclient.getRequestById(requestId);
  }
  catch(err) {
    winston.error("(tybotRoute) request not found with id " +  requestId);
  }

  if (!request) {
    winston.verbose("(tybotRoute) Creating new Request. Chatbot-pure directives still work. Tiledesk specific directives don't")
    const request_botId_key = "tilebot:botId_requests:" + requestId;
    const botId = await runtimeContext.tdcache.get(request_botId_key);
    winston.verbose("(tybotRoute) current botId [" + request_botId_key + "]:" + botId)
    request = {
      request_id: requestId,
      id_project: projectId,
      bot_id: botId
    }
  }
  winston.debug("(tybotRoute) request: ", request);
  winston.debug("(tybotRoute) API_ENDPOINT: " + runtimeContext.API_ENDPOINT);
  winston.debug("(tybotRoute) request: " + runtimeContext.TILEBOT_ENDPOINT);

  let directivesPlug = new DirectivesChatbotPlug({supportRequest: request, API_ENDPOINT: runtimeContext.API_ENDPOINT, TILEBOT_ENDPOINT: runtimeContext.TILEBOT_ENDPOINT, token: token, HELP_CENTER_API_ENDPOINT: endpoints.helpCenterApiEndpoint(), cache: runtimeContext.tdcache});

  const original_answer_text = answer.text;
  const bot_answer = await ExtUtil.execPipelineExt(request, answer, directivesPlug, runtimeContext.tdcache);
  winston.debug("(tybotRoute) bot_answer: ", bot_answer);

  if (bot_answer) {
    winston.debug("(tybotRoute) adding to bot_answer original_answer_text: ", original_answer_text);
    if (!bot_answer.attributes) {
      bot_answer.attributes = {};
    }
    
    bot_answer.attributes["_raw_message"] = original_answer_text;
    tdclient.sendSupportMessage(requestId, bot_answer, (err, response) => {
      winston.verbose("(tybotRoute) Bot answer sent")
      if (err) {
        winston.error("(tybotRoute) Error sending message", err);
      }
      directivesPlug.processDirectives(() => {
        winston.verbose("(tybotRoute) Directives executed")
      });
    });
  }
  else {
    winston.verbose("(tybotRoute) No bot_answer")
    directivesPlug.processDirectives(() => {
      winston.verbose("(tybotRoute) Directives executed")
    });
  }
  
});

}

module.exports = { registerMessageRoutes };
