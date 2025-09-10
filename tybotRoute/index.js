const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const winston = require('./utils/winston.js')
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { ExtApi } = require('./ExtApi.js');
const { ExtUtil } = require('./ExtUtil.js');
const { TdCache } = require('./TdCache.js');
const { TiledeskChatbot } = require('./engine/TiledeskChatbot.js');
const { MongodbBotsDataSource } = require('./engine/MongodbBotsDataSource.js');
const { MockBotsDataSource } = require('./engine/mock/MockBotsDataSource.js');
const { TiledeskChatbotConst } = require('./engine/TiledeskChatbotConst.js');
const { IntentsMachineFactory } = require('./engine/IntentsMachineFactory.js');
const { v4: uuidv4 } = require('uuid');
let axios = require('axios');
const { customAlphabet } = require('nanoid');
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);
// let parser = require('accept-language-parser');

router.use(bodyParser.json({limit: '50mb'}));
router.use(bodyParser.urlencoded({ extended: true , limit: '50mb'}));

/** @type {TdCache} */
let tdcache = null;
let MAX_STEPS = 1000;
let MAX_EXECUTION_TIME = 1000 * 3600 * 8;

// DEV
// const { MessagePipeline } = require('./tiledeskChatbotPlugs/MessagePipeline');
const { DirectivesChatbotPlug } = require('./tiledeskChatbotPlugs/DirectivesChatbotPlug');

// THE IMPORT
let mongoose = require('mongoose');
// const { Directives } = require('./tiledeskChatbotPlugs/directives/Directives.js');
const { TiledeskChatbotUtil } = require('./utils/TiledeskChatbotUtil.js'); //require('@tiledesk/tiledesk-chatbot-util');

const AiService = require('./services/AIService.js');
const tilebotService = require('./services/TilebotService.js');

let API_ENDPOINT = null;
let TILEBOT_ENDPOINT = null;
let staticBots;

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
  await tdcache.set(
    request_botId_key,
    botId,
    {EX: 604800} // 7 days
  );

  let botsDS;
  if (!staticBots) {
    botsDS = new MongodbBotsDataSource({projectId: projectId, botId: botId});
    winston.verbose("(tybotRoute) botsDS created with Mongo");
  }
  else {
    botsDS = new MockBotsDataSource(staticBots);
  }
  
  // get the bot metadata
  let bot = await botsDS.getBotByIdCache(botId, tdcache).catch((err)=> {
    Promise.reject(err);
    return;
  });

  winston.debug("(tybotRoute) Bot found: ", bot)
  
  
  let intentsMachine;
  let backupMachine;
  if (!staticBots) {
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
    APIURL: API_ENDPOINT,
    APIKEY: "___",
    tdcache: tdcache,
    requestId: requestId,
    projectId: projectId,
    MAX_STEPS: MAX_STEPS,
    MAX_EXECUTION_TIME: MAX_EXECUTION_TIME
  });
  winston.verbose("(tybotRoute) Message text: " + message.text)
  
  await TiledeskChatbotUtil.updateRequestAttributes(chatbot, token, message, projectId, requestId);
  if (requestId.startsWith("support-group-")) {
    await TiledeskChatbotUtil.updateConversationTranscript(chatbot, message);
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
          API_ENDPOINT: API_ENDPOINT,
          TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
          token: token,
          // HELP_CENTER_API_ENDPOINT: process.env.HELP_CENTER_API_ENDPOINT,
          cache: tdcache
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
      TILEBOT_ENDPOINT: TILEBOT_ENDPOINT
    });
    apiext.sendSupportMessageExt(reply, projectId, requestId, token, () => {

      winston.verbose("(tybotRoute) sendSupportMessageExt reply sent: ", reply)
    });
  }
  
});

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
    APIURL: API_ENDPOINT,
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
    const botId = await tdcache.get(request_botId_key);
    winston.verbose("(tybotRoute) current botId [" + request_botId_key + "]:" + botId)
    request = {
      request_id: requestId,
      id_project: projectId,
      bot_id: botId
    }
  }
  winston.debug("(tybotRoute) request: ", request);
  winston.debug("(tybotRoute) API_ENDPOINT: " + API_ENDPOINT);
  winston.debug("(tybotRoute) request: " + TILEBOT_ENDPOINT);

  let directivesPlug = new DirectivesChatbotPlug({supportRequest: request, API_ENDPOINT: API_ENDPOINT, TILEBOT_ENDPOINT: TILEBOT_ENDPOINT, token: token, HELP_CENTER_API_ENDPOINT: process.env.HELP_CENTER_API_ENDPOINT, cache: tdcache});

  const original_answer_text = answer.text;
  const bot_answer = await ExtUtil.execPipelineExt(request, answer, directivesPlug, tdcache);
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

router.get('/message/context/:messageid', async (req, res) => {
  const messageid = req.params.messageid;
  const message_key = "tiledesk:messages:context:" + messageid;
  const message_context_s = await tdcache.get(message_key);
  if (message_context_s) {
    const message_context = JSON.parse(message_context_s);
    res.send(message_context);
  }
  else {
    res.send(null);
  }
});

router.get('/ext/reserved/parameters/requests/:requestid', async (req, res) => {
  const requestId = req.params.requestid;
  const parameters = await TiledeskChatbot.allParametersStatic(tdcache, requestId);
  if (parameters === null) {
    res.send([]);
    return;
  }
  if (req.query.all != null) {
    res.send(parameters);
  }
  else {
    const userParams = TiledeskChatbotUtil.userFlowAttributes(parameters);
    res.send(userParams);
  }
});

router.get('/ext/parameters/requests/:requestid', async (req, res) => {

  const requestId = req.params.requestid;
  if (!requestId) {
    res.status(404).send("Not found");
    return;
  }
  const request_parts = requestId.split("-");
  if (request_parts && request_parts.length >= 4) {
    const project_id = request_parts[2];
    if (project_id !== "656054000410fa00132e5dcc") { //&& project_id !== "ANOTHER P_ID"
      res.status(401).send("Unauthorized");
      return;
    }
  }
  else if (!request_parts || (request_parts && request_parts.length < 4) ) {
    res.status(500).send("Invalid request id " + requestId);
    return;
  }
  const parameters = await TiledeskChatbot.allParametersStatic(tdcache, requestId);
  if (parameters === null) {
    res.send([]);
    return;
  }
  if (req.query.all != null) {
    res.send(parameters);
  }
  else {
    const userParams = TiledeskChatbotUtil.userFlowAttributes(parameters);
    res.send(userParams);
  }
});

router.get('/', (req, res) => {
  res.send('Hello Tilebot!');
});

router.get('/test/webrequest/get/plain/:username', async (req, res) => {
  res.send(`Application var ${req.params['username']}`);
});

router.post('/test/webrequest/post/plain', async (req, res) => {
  winston.verbose("(tybotRoute) POST /test/webrequest/post/plain called");
  winston.debug("(tybotRoute) POST /test/webrequest/post/plain req.body:", req.body);
  if (req && req.body && req.body.name) {
    res.send("Your name is " + req.body.name);
  }
  else {
    res.send("No HTTP POST provided");
  }
});

router.post('/echobot', (req, res) => {
  winston.verbose("(tybotRoute) POST /echobot called");
  winston.debug("(tybotRoute) POST /echobot req.body: ", req.body.payload);

  const message = req.body.payload;
  const token = req.body.token;
  const requestId = message.request.request_id;
  const projectId = message.id_project;

  const tdclient = new TiledeskClient({
    projectId: projectId,
    token: token,
    APIURL: API_ENDPOINT,
    APIKEY: "___"
  });

  // instantly reply "success" to TILEDESK
  res.status(200).send({"success":true});
  // Replies are asynchronous
  let msg = {
    text: message.text
  }
  tdclient.sendSupportMessage(requestId, msg, (err, response) => {
    if (err) {
      winston.error("(tybotRoute) Error sending message"); //, err);
    }
  });
});

router.post('/block/:project_id/:bot_id/:block_id', async (req, res) => {

  const project_id = req.params.project_id;
  const bot_id = req.params.bot_id;
  const block_id = req.params.block_id;
  const body = req.body;

  winston.verbose("(tybotRoute) POST /block/:project_id/:bot_id/:block_id called");
  winston.debug("(tybotRoute) POST /block/:project_id/:bot_id/:block_id req.body: ", body);

  const async = body.async;
  const token = body.token;
  delete body.async;
  delete body.token;

  let draft = req.body.draft || false;
  
  // invoke block
  // unique ID for each execution
  let request_id;
  if (body.preloaded_request_id) {
    request_id = body.preloaded_request_id;
  } else {
    const execution_id = uuidv4().replace(/-/g, '');
    request_id = "automation-request-" + project_id + "-" + execution_id;
  }
  const command = "/#" + block_id;
  let message = {
    payload: {
      recipient: request_id,
      text: command,
      id_project: project_id,
      request: {
        request_id: request_id,
        draft: draft
      },
      attributes: {
        payload: body
      }
    },
    token: token
  }

  if (async) {
    winston.verbose("Async webhook");
    tilebotService.sendMessageToBot(message, bot_id, (err, resbody) => {
      if (err) {
        winston.error("Async webhook err:\n", err);
        return res.status(500).send({ success: false, error: err });
      }
      return res.status(200).send({ success: true });
    })
  } else {
    
    winston.verbose("Sync webhook. Subscribe and await for reply...")
    let uniqueid = nanoid();
    const topic = `/webhooks/${request_id}`;
    
    try {

      const listener = async (message, topic) => {
        winston.debug("Web response is: " + JSON.stringify(message) + " for topic " + topic);
        await tdcache.unsubscribe(topic);

        let json = JSON.parse(message);
        let status = json.status ? json.status : 200;
        winston.debug("Web response status: " + status);

        return res.status(status).send(json.payload);
      }
      await tdcache.subscribe(topic, listener);

    } catch(err) {
      winston.error("Error cache subscribe ", err);
      return res.status(500).send({ success: false, error: "Error during cache subscription"})
    }

    tilebotService.sendMessageToBot(message, bot_id, () => {
      winston.debug("Sync webhook message sent: ", message);
    })
  }

});


async function startApp(settings, completionCallback) {
  winston.info("(Tilebot) Starting Tilebot..")

  if (settings.bots) { // static bots data source
    staticBots = settings.bots;
  }
  else { // mongodb data source
    if (!settings.MONGODB_URI) {
      throw new Error("settings.MONGODB_URI is mandatory id no settings.bots.");
    }
  }
  
  if (!settings.API_ENDPOINT) {
    throw new Error("settings.API_ENDPOINT is mandatory id no settings.bots.");
  }
  else {
    API_ENDPOINT = settings.API_ENDPOINT;
    winston.info("(Tilebot) settings.API_ENDPOINT:" + API_ENDPOINT);
  }

  if (!settings.TILEBOT_ENDPOINT) {
    TILEBOT_ENDPOINT = `${API_ENDPOINT}/modules/tilebot`
  }
  else {
    TILEBOT_ENDPOINT = settings.TILEBOT_ENDPOINT
  }
  winston.info("(Tilebot) settings.TILEBOT_ENDPOINT:" + TILEBOT_ENDPOINT);

  if (settings.REDIS_HOST && settings.REDIS_PORT) {
    tdcache = new TdCache({
      host: settings.REDIS_HOST,
      port: settings.REDIS_PORT,
      password: settings.REDIS_PASSWORD
    });
  }
  
  winston.info("(Tilebot) Log Level: " + process.env.LOG_LEVEL);

  if (process.env.CHATBOT_MAX_STEPS) {
    MAX_STEPS = Number(process.env.CHATBOT_MAX_STEPS);
  }

  if (process.env.CHATBOT_MAX_EXECUTION_TIME) {
    MAX_EXECUTION_TIME = Number(process.env.CHATBOT_MAX_EXECUTION_TIME);// test // prod1000 * 3600 * 4; // 4 hours
  }

  winston.info("(Tilebot) MAX_STEPS: " + MAX_STEPS);
  winston.info("(Tilebot) MAX_EXECUTION_TIME: " + MAX_EXECUTION_TIME);
  
  var pjson = require('./package.json');
  winston.info("(Tilebot) Starting Tilebot connector v" + pjson.version);

  if (!staticBots) {
    winston.info("(Tilebot) Connecting to MongoDB...");
    // connection = 
    mongoose.connect(settings.MONGODB_URI, { "useNewUrlParser": true, "autoIndex": false }, async (err) => {
      if (err) { 
        winston.error('(Tilebot) Failed to connect to MongoDB on ' + settings.MONGODB_URI + " ", err);
      }
      else {
        winston.info("(Tilebot) MongoDB Connected");
        await connectRedis();
        winston.info("(Tilebot) Tilebot started");

        if (completionCallback) {
          completionCallback();
        }
      }
    });
  }
  else {
    winston.info("(Tilebot) Using static bots");
    await connectRedis();
    winston.info("(Tilebot) Tilebot started");
    if (completionCallback) {
      completionCallback();
    }
  }
}

async function connectRedis() {
  if (tdcache) {
    try {
      winston.info("(Tilebot) Connecting Redis...");
      await tdcache.connect();
    }
    catch (error) {
      tdcache = null;
      winston.error("(Tilebot) Redis connection error: ", error);
      process.exit(1);
    }
    winston.info("(Tilebot) Redis connected");
  }
  return;
}

async function checkRequest(request_id, id_project) {
  // TO DO CHECK

  // if (request_id startsWith "support-request-{$project_id}")
  //    if (project_id is equal to the id_project)
  //        return true;
  //    else 
  //        return (false, motivation)
  // else if (request_id startsWith "automation-request-{$project_id}")
  //    if (project_id is equal to the id_project)
  //        return true;
  //    else 
  //        return (false, motivation)
  // else
  //    return (false, motivation);
  
  // WARNING! Move this function in models/TiledeskChatbotUtil.js
}

function myrequest(options, callback) {
  winston.verbose("(tybotRoute) myrequest API URL:" + options.url);
  winston.debug("(tybotRoute) myrequest Options:", options);

  axios(
    {
      url: options.url,
      method: options.method,
      data: options.json,
      params: options.params,
      headers: options.headers
    })
    .then((res) => {
      winston.verbose("Response for url:" + options.url);
      winston.debug("Response headers:\n", res.headers);
      if (res && res.status == 200 && res.data) {
        if (callback) {
          callback(null, res.data);
        }
      }
      else {
        if (callback) {
          callback(TiledeskClient.getErr({ message: "Response status not 200" }, options, res), null, null);
        }
      }
    }).catch((error) => {
      winston.error("(tybotRoute index) An error occurred: ", error);
      if (callback) {
        callback(error, null, null);
      }
    }
  );
}

module.exports = { router: router, startApp: startApp};