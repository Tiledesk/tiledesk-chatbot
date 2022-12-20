const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
//var cors = require('cors');
//let path = require("path");
//let fs = require('fs');
const { TiledeskChatbotClient } = require('@tiledesk/tiledesk-chatbot-client');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
//const jwt = require('jsonwebtoken');
//const { v4: uuidv4 } = require('uuid');
const { ExtApi } = require('./ExtApi.js');
const { ExtUtil } = require('./ExtUtil.js');
const { TdCache } = require('./TdCache.js');
//const { IntentForm } = require('./IntentForm.js');
const { TiledeskChatbot } = require('./models/TiledeskChatbot.js');
const { MongodbBotsDataSource } = require('./models/MongodbBotsDataSource.js');
const { MongodbIntentsMachine } = require('./models/MongodbIntentsMachine.js');
const { TiledeskIntentsMachine } = require('./models/TiledeskIntentsMachine.js');

//router.use(cors());
router.use(bodyParser.json({limit: '50mb'}));
router.use(bodyParser.urlencoded({ extended: true , limit: '50mb'}));

let log = false;
let tdcache = null;

// DEV
const { MessagePipeline } = require('./tiledeskChatbotPlugs/MessagePipeline');
const { DirectivesChatbotPlug } = require('./tiledeskChatbotPlugs/DirectivesChatbotPlug');
/*const { SplitsChatbotPlug } = require('./tiledeskChatbotPlugs/SplitsChatbotPlug');
const { MarkbotChatbotPlug } = require('./tiledeskChatbotPlugs/MarkbotChatbotPlug');*/
const { WebhookChatbotPlug } = require('./tiledeskChatbotPlugs/WebhookChatbotPlug');

// PROD
/*const { MessagePipeline } =  require('@tiledesk/tiledesk-chatbot-plugs/MessagePipeline');
const { DirectivesChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/DirectivesChatbotPlug');
const { SplitsChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/SplitsChatbotPlug');
const { MarkbotChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/MarkbotChatbotPlug');
const { WebhookChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/WebhookChatbotPlug');*/

// THE IMPORT
let mongoose = require('mongoose');
//let Faq = require('./models/faq');
//let Faq_kb = require('./models/faq_kb');
let connection;
let APIURL = null;

router.post('/ext/:botid', async (req, res) => {
  if (log) {console.log("REQUEST BODY:", JSON.stringify(req.body));}
  if (log) {
    console.log("TiledeskClient.version09()...");
    TiledeskClient.version09();
  }
  res.status(200).send({"success":true});

  const botId = req.params.botid;
  if (log) {console.log("query botId:", botId);}
  const message = req.body.payload;
  const messageId = message._id;
  //const faq_kb = req.body.hook; now it is "bot"
  const token = req.body.token;
  const requestId = message.request.request_id;
  const projectId = message.id_project;


  // NEXTTTTTTT
  const message_context = {
    projectId: projectId,
    requestId: requestId,
    token: token
  }
  const message_context_key = "tiledesk:messages:context:" + messageId;
  await tdcache.set(
    message_context_key,
    JSON.stringify(message_context),
    {EX: 86400}
  );
  if (log) {console.log("message context saved for messageid:", message_context_key)}
  // provide a http method for set/get message context, authenticated with tiledesk token and APIKEY.
  // NEXTTTTTTT


  const botsDS = new MongodbBotsDataSource({projectId: projectId, botId: botId});

  // get the bot metadata
  let bot = null;
  try {
    bot = await botsDS.getBotById(botId);
  }
  catch(error) {
    console.error("Error getting botId:", botId);
    console.error("Error getting bot was:", error);
    return;
  }
  
  let intentsMachine = new MongodbIntentsMachine({projectId: projectId, language: bot.language});
  if (bot.intentsEngine === "tiledesk-ai") {
    intentsMachine = new TiledeskIntentsMachine(
      {
        projectId: projectId,
        language: bot.language,
        TILEBOT_AI_ENDPOINT: process.env.TILEBOT_AI_ENDPOINT
      });
  }
  
  //const intentsMachine = new TiledeskIntentsMachine({API_ENDPOINT: "https://MockIntentsMachine.tiledesk.repl.co", log: true});
  const chatbot = new TiledeskChatbot({
    botsDataSource: botsDS, 
    intentsFinder: intentsMachine,
    botId: botId,
    bot: bot,
    token: token,
    APIURL: APIURL,
    APIKEY: "___",
    tdcache: tdcache,
    requestId: requestId,
    projectId: projectId,
    log: log
  });

  await chatbot.addParameter("_tdLastMessageId", messageId);
  await chatbot.addParameter("_tdProjectId", projectId);
  let reply = await chatbot.replyToMessage(message);
  if (!reply) {
    reply = {
      "text": "No messages found. Is 'defaultFallback' intent missing?"
    }
  }
  reply.triggeredByMessageId = messageId;
  let extEndpoint = `${APIURL}/modules/tilebot/`;
  if (process.env.TYBOT_ENDPOINT) {
    extEndpoint = `${process.env.TYBOT_ENDPOINT}`;
  }
  const apiext = new ExtApi({
    ENDPOINT: extEndpoint,
    log: log
  });

  apiext.sendSupportMessageExt(reply, projectId, requestId, token, () => {
    if (log) {
      console.log("SupportMessageExt() reply sent:", reply);
    }
  });
  
});

router.post('/ext/:projectId/requests/:requestId/messages', async (req, res) => {
  res.json({success:true});
  const projectId = req.params.projectId;
  const requestId = req.params.requestId;
  const token = req.headers["authorization"];
  let answer = req.body;
  const tdclient = new TiledeskClient({
    projectId: projectId,
    token: token,
    APIURL: APIURL,
    APIKEY: "___",
    log: false
  });
  let request;
  const request_key = "tilebot:" + requestId;
  if (log) {console.log("request_key:", request_key);}
  if (tdcache) {
    request = await tdcache.getJSON(request_key)
    if (log) {console.log("Request from cache:", request);}
    if (!request) {
      if (log) {console.log("!Request from cache", requestId);}
      try {
        request = await tdclient.getRequestById(requestId);
      }
      catch(err) {
        console.error("Error getting the request:", err)
      }
      if (log) {console.log("Got request with APIs (after no cache hit)");}
    }
  }
  else {
    if (log) {console.log("No tdcache. Getting request with APIs", requestId);}
    try {
      request = await tdclient.getRequestById(requestId);
    }
    catch(err) {
      console.log("Request not found.");
    }
    if (log) {console.log("(No tdcache) Got request with APIs");}
  }
  if (!request) {
    // chatbot-pure directives still work. Tiledesk specific directives don't
    request = {
      request_id: requestId,
      id_project: projectId
    }
  }
  else {
    if (log) {console.log("request", request);}
  }
  if (log) {console.log("request...", request);}
  let directivesPlug = new DirectivesChatbotPlug({supportRequest: request, TILEDESK_API_ENDPOINT: APIURL, TILEBOT_ENDPOINT:process.env.TYBOT_ENDPOINT, token: token, log: log, HELP_CENTER_API_ENDPOINT: process.env.HELP_CENTER_API_ENDPOINT, cache: tdcache});
  // PIPELINE-EXT
  if (log) {console.log("answer to process:", JSON.stringify(answer));}
  const original_answer_text = answer.text;
  const bot_answer = await ExtUtil.execPipelineExt(request, answer, directivesPlug, tdcache, log);
  // console.log("bot_answer", bot_answer)
  //const bot_answer = answer;
  // console.log("bot_answer to send:", bot_answer);
  // empty answer
  // let b = {
  //      text: '',
  //      attributes: {
  //        clienttimestamp: 1670571497092,
  //        _answerid: '638c7b0c1db44900351104b1',
  //        intent_info: {
  //          intent_name: 'wantagent',
  //          is_fallback: false,
  //          question_payload: [Object],
  //          botId: '638c78d71db44900351101c2',
  //          bot: [Object]
  //        },
  //        directives: true,
  //        splits: true,
  //        markbot: true,
  //        fillParams: true,
  //        webhook: false
  //      },
  //      triggeredByMessageId: '6392e5e8408e0000437aa383'
  //    }
  if (bot_answer) {
    if (log) {console.log("adding to bot_answer original_answer_text:", JSON.stringify(original_answer_text));}
    if (!bot_answer.attributes) {
      bot_answer.attributes = {};
    }
    bot_answer.attributes["_raw_message"] = original_answer_text;
    if (log) {console.log("bot_answer", JSON.stringify(bot_answer));}
    tdclient.sendSupportMessage(requestId, bot_answer, (err, response) => {
      if (err) {
        console.error("Error sending message", err);
      }
      directivesPlug.processDirectives( () => {
        if (log) {console.log("After message - Directives executed.");}
      });
    });
  }
  else {
    directivesPlug.processDirectives( () => {
      if (log) {console.log("Directives executed.");}
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

router.get('/ext/parameters/requests/:requestid', async (req, res) => {
  const requestId = req.params.requestid;
  const parameters = await TiledeskChatbot.allParametersStatic(tdcache, requestId);
  console.log("parameters:", parameters);
  console.log("req.query.all:", req.query.all);
  if (req.query.all != null) {
    res.send(parameters);
  }
  else {
    let userParams = {};
    if (parameters) {
      for (const [key, value] of Object.entries(parameters)) {
        console.log(key, value);
        if (!key.startsWith("_td")) {
          userParams[key] = value;
        }
      }
    }
    res.send(userParams);
  }
  
  
});

router.get('/', (req, res) => {
  res.send('Hello Tilebot!');
});

function startApp(settings, completionCallback) {
  console.log("Starting Tilebot with Settings:", settings);

  if (!settings.MONGODB_URI) {
    throw new Error("settings.MONGODB_URI is mandatory.");
  }
  if (!settings.API_ENDPOINT) {
    throw new Error("settings.API_ENDPOINT is mandatory.");
  }
  else {
    APIURL = settings.API_ENDPOINT;
    console.log("(Tilebot) settings.API_ENDPOINT:", APIURL);
  }
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
  console.log("(Tilebot) log:", log);
  var pjson = require('./package.json');
  console.log("(Tilebot) Starting Tilebot connector v" + pjson.version);
  console.log("(Tilebot) Connecting to mongodb...");

  connection = mongoose.connect(settings.MONGODB_URI, { "useNewUrlParser": true, "autoIndex": false }, async (err) => {
    if (err) { 
      console.error('(Tilebot) Failed to connect to MongoDB on ' + settings.MONGODB_URI + " ", err);
      //process.exit(1); // add => exitOnFail: true
    }
    else {
      console.log("(Tilebot) mongodb connection ok.");
      if (tdcache) {
        try {
          console.log("(Tilebot) Connecting Redis...");
          await tdcache.connect();
        }
        catch (error) {
          tdcache = null;
          console.error("(Tilebot) Redis connection error:", error);
          process.exit(1);
        }
        console.log("(Tilebot) Redis connected.");
      }
      console.info("Tilebot started.");
      if (completionCallback) {
        completionCallback();
      }
    }
  });
}

module.exports = { router: router, startApp: startApp};