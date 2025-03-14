const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const winston = require('./utils/winston.js')
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { ExtApi } = require('./ExtApi.js');
const { ExtUtil } = require('./ExtUtil.js');
const { TdCache } = require('./TdCache.js');
const { TiledeskChatbot } = require('./models/TiledeskChatbot.js');
const { MongodbBotsDataSource } = require('./models/MongodbBotsDataSource.js');
// const { MongodbIntentsMachine } = require('./models/MongodbIntentsMachine.js');
// const { TiledeskIntentsMachine } = require('./models/TiledeskIntentsMachine.js');
const { MockBotsDataSource } = require('./models/MockBotsDataSource.js');
const { TiledeskChatbotConst } = require('./models/TiledeskChatbotConst');
const { IntentsMachineFactory } = require('./models/IntentsMachineFactory');
const { v4: uuidv4 } = require('uuid');
let axios = require('axios');
// let parser = require('accept-language-parser');

router.use(bodyParser.json({limit: '50mb'}));
router.use(bodyParser.urlencoded({ extended: true , limit: '50mb'}));

let log = false;
let tdcache = null;
let MAX_STEPS = 1000;
let MAX_EXECUTION_TIME = 1000 * 3600 * 8;

// DEV
// const { MessagePipeline } = require('./tiledeskChatbotPlugs/MessagePipeline');
const { DirectivesChatbotPlug } = require('./tiledeskChatbotPlugs/DirectivesChatbotPlug');

// THE IMPORT
let mongoose = require('mongoose');
// const { Directives } = require('./tiledeskChatbotPlugs/directives/Directives.js');
const { TiledeskChatbotUtil } = require('./models/TiledeskChatbotUtil.js'); //require('@tiledesk/tiledesk-chatbot-util');
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

  // let request_check = checkRequest(message.request.request_id, message.id_project);
  // if (request_check === true) {
  //   res.status(200).send({ "successs": true });
  // } else {
  //   return res.status(400).send({ "success": false, "message": "Invalid request_id"})
  // }
  // res.status(200).send({"success":true});

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
    botsDS = new MongodbBotsDataSource({projectId: projectId, botId: botId, log: log});
    winston.verbose("(tybotRoute) botsDS created with Mongo");
  }
  else {
    botsDS = new MockBotsDataSource(staticBots);
  }


  let bot = await botsDS.getBotByIdCache(botId, tdcache).catch((err)=> {
    Promise.reject(err);
    res.status(400).send({"success": false, error: "Bot not found with id: "+botId}) 
    return;
  });
  

  winston.debug("(tybotRoute) Bot found:" + bot)
  
  let intentsMachine;
  let backupMachine;
  if (!staticBots) {
    intentsMachine = IntentsMachineFactory.getMachine(bot, botId, projectId, log);
    backupMachine = IntentsMachineFactory.getBackupMachine(bot, botId, projectId, log);
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
    MAX_EXECUTION_TIME: MAX_EXECUTION_TIME,
    log: log
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
  }
  if (!reply) {
    reply = {
      "text": "No messages found. Is 'defaultFallback' intent missing?"
    }
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
          log: log,
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
      TILEBOT_ENDPOINT: TILEBOT_ENDPOINT,
      log: false
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
    APIKEY: "___",
    log: false
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

  let directivesPlug = new DirectivesChatbotPlug({supportRequest: request, API_ENDPOINT: API_ENDPOINT, TILEBOT_ENDPOINT: TILEBOT_ENDPOINT, token: token, log: log, HELP_CENTER_API_ENDPOINT: process.env.HELP_CENTER_API_ENDPOINT, cache: tdcache});

  const original_answer_text = answer.text;
  const bot_answer = await ExtUtil.execPipelineExt(request, answer, directivesPlug, tdcache, log);
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
    APIKEY: "___",
    log: false
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

// draft webhook
router.post('/block/:project_id/:bot_id/:block_id', async (req, res) => {
  const project_id = req.params['project_id'];
  const bot_id = req.params['bot_id'];
  const block_id = req.params['block_id'];
  const body = req.body;

  winston.verbose("(tybotRoute) POST /block/:project_id/:bot_id/:block_id called");
  winston.debug("(tybotRoute) POST /block/:project_id/:bot_id/:block_id req.body: ", body);

  // invoke block
  // unique ID for each execution
  const execution_id = uuidv4().replace(/-/g, '');
  const request_id = "automation-request-" + project_id + "-" + execution_id;
  const command = "/" + block_id;
  let request = {
    "payload": {
      "recipient": request_id,
      "text": command,
      "id_project": project_id,
      "request": {
        "request_id": request_id
      },
      "attributes": {
        "payload": body
      }
    },
    "token": "NO-TOKEN"
  }
  winston.verbose("(tybotRoute) sendMessageToBot(): ", request)
  sendMessageToBot(TILEBOT_ENDPOINT, request, bot_id, async () => {
    res.status(200).send({"success":true});
    return;
  });
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
  
  if (!settings.log) {
    log = false;
  }
  else {
    log = true;
  }
  winston.info("(Tilebot) Log: " + log);

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

/**
 * A stub to send message to the "ext/botId" endpoint, hosted by tilebot on:
 * /${TILEBOT_ROUTE}/ext/${botId}
 *
 * @param {Object} message. The message to send
 * @param {string} botId. Tiledesk botId
 * @param {string} token. User token
 */
function sendMessageToBot(TILEBOT_ENDPOINT, message, botId, callback) {
   
  const url = `${TILEBOT_ENDPOINT}/ext/${botId}`;
  winston.verbose("sendMessageToBot URL" + url);
  const HTTPREQUEST = {
    url: url,
    headers: {
      'Content-Type': 'application/json'
    },
    json: message,
    method: 'POST'
  };
  myrequest(
    HTTPREQUEST,
    function (err, resbody) {
      if (err) {
        if (callback) {
          callback(err);
        }
      }
      else {
        if (callback) {
          callback(null, resbody);
        }
      }
    }, false
  );
}

function myrequest(options, callback, log) {
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