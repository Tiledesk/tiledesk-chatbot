const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
//var cors = require('cors');
//let path = require("path");
//let fs = require('fs');
// const { TiledeskChatbotClient } = require('@tiledesk/tiledesk-chatbot-client');
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
// const { MockActions } = require('./MockActions');
const { MockBotsDataSource } = require('./models/MockBotsDataSource.js');
const { TiledeskChatbotConst } = require('./models/TiledeskChatbotConst');

//router.use(cors());
router.use(bodyParser.json({limit: '50mb'}));
router.use(bodyParser.urlencoded({ extended: true , limit: '50mb'}));

let log = false;
let tdcache = null;

// DEV
// const { MessagePipeline } = require('./tiledeskChatbotPlugs/MessagePipeline');
const { DirectivesChatbotPlug } = require('./tiledeskChatbotPlugs/DirectivesChatbotPlug');
// const { SplitsChatbotPlug } = require('./tiledeskChatbotPlugs/SplitsChatbotPlug');
// const { MarkbotChatbotPlug } = require('./tiledeskChatbotPlugs/MarkbotChatbotPlug');
// const { WebhookChatbotPlug } = require('./tiledeskChatbotPlugs/WebhookChatbotPlug');

// PROD
// const { MessagePipeline } =  require('@tiledesk/tiledesk-chatbot-plugs/MessagePipeline');
// const { DirectivesChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/DirectivesChatbotPlug');
// const { SplitsChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/SplitsChatbotPlug');
// const { MarkbotChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/MarkbotChatbotPlug');
// const { WebhookChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/WebhookChatbotPlug');

// THE IMPORT
let mongoose = require('mongoose');
// const { DirSendEmail } = require('./tiledeskChatbotPlugs/directives/DirSendEmail.js');
const { Directives } = require('./tiledeskChatbotPlugs/directives/Directives.js');
let APIURL = null;
let staticBots;

router.post('/ext/:botid', async (req, res) => {
  if (req && req.body && req.body.payload && req.body.payload.request && req.body.payload.request.snapshot) {
    delete req.body.payload.request.snapshot;
    console.log("Removed req.body.payload.request.snapshot field");
  }
  if (log) {console.log("REQUEST BODY:", JSON.stringify(req.body));}
  res.status(200).send({"success":true});
  
  const botId = req.params.botid;
  if (log) {console.log("query botId:", botId);}
  const message = req.body.payload;
  const messageId = message._id;
  //const faq_kb = req.body.hook; now it is "bot"
  const token = req.body.token;
  const requestId = message.request.request_id;
  const projectId = message.id_project;
  if (log) {console.log("message.id_project:", message.id_project);}
  // adding info for internal context workflow
  message.request.bot_id = botId;
  if (message.request.id_project === null || message.request.id_project === undefined) {
    message.request.id_project = projectId;
  }
  
  // NEXTTTTTTT
  // const message_context = {
  //   projectId: projectId,
  //   requestId: requestId,
  //   token: token
  // }
  // const message_context_key = "tiledesk:messages:context:" + messageId;
  // await tdcache.set(
  //   message_context_key,
  //   JSON.stringify(message_context),
  //   {EX: 86400}
  // );
  // if (log) {console.log("message context saved for messageid:", message_context_key)}
  // provide a http method for set/get message context, authenticated with tiledesk token and APIKEY.
  // NEXTTTTTTT

  let botsDS;
  if (!staticBots) {
    botsDS = new MongodbBotsDataSource({projectId: projectId, botId: botId});
  }
  else {
    botsDS = new MockBotsDataSource(staticBots);
    // console.log("botDA.data.........", botsDS.data);
  }
  
  // get the bot metadata
  let bot = null;
  try {
    // bot = await botsDS.getBotById(botId);
    // bot = await botById(botId, projectId, tdcache, botsDS);
    bot = botsDS.getBotByIdCache(botId, tdcache);
  }
  catch(error) {
    console.error("Error getting botId:", botId);
    console.error("Error getting bot was:", error);
    return;
  }
  
  let intentsMachine;
  if (!staticBots) {
    if (log) {console.log("intentsMachine to MongoDB");}
    intentsMachine = new MongodbIntentsMachine({projectId: projectId, language: bot.language, log});
    if (bot.intentsEngine === "tiledesk-ai") {
      if (log) {console.log("intentsMachine to tiledesk-ai");}
      intentsMachine = new TiledeskIntentsMachine(
        {
          //projectId: projectId,
          //language: bot.language,
          botId: botId
          //TILEBOT_AI_ENDPOINT: process.env.TILEBOT_AI_ENDPOINT
        });
    }
  }
  else {
    intentsMachine = {}
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
  
  await updateRequestVariables(chatbot, message, projectId, requestId);

  let reply = await chatbot.replyToMessage(message);
  if (!reply) {
    reply = {
      "text": "No messages found. Is 'defaultFallback' intent missing?"
    }
  }
  
  // console.log("reply.actions:", reply.actions);
  if (reply.actions && reply.actions.length > 0) { // structured actions (coming from chatbot designer)
    if (log) {console.log("the actions:", JSON.stringify(reply.actions));}
    let directives = actionsToDirectives(reply.actions);
    if (log) {console.log("the directives:", JSON.stringify(directives));}
    let directivesPlug = new DirectivesChatbotPlug(
      {
        directives: directives,
        supportRequest: message.request,
        TILEDESK_API_ENDPOINT: APIURL,
        TILEBOT_ENDPOINT:process.env.TYBOT_ENDPOINT,
        token: token,
        log: log,
        HELP_CENTER_API_ENDPOINT: process.env.HELP_CENTER_API_ENDPOINT,
        cache: tdcache
      }
    );
    directivesPlug.processDirectives( () => {
      if (log) {console.log("Actions - Directives executed.");}
    });
  }
  else { // text answer (parse text directives to get actions)
    if (log) {console.log("an answer:", reply.text);}
    reply.triggeredByMessageId = messageId;
    if (!reply.attributes) {
      reply.attributes = {}
    }
    reply.attributes.directives = true;
    reply.attributes.splits = true;
    reply.attributes.markbot = true;
    reply.attributes.fillParams = true;
    let extEndpoint = `${APIURL}/modules/tilebot/`;
    if (process.env.TYBOT_ENDPOINT) {
      extEndpoint = `${process.env.TYBOT_ENDPOINT}`;
    }
    const apiext = new ExtApi({
      ENDPOINT: extEndpoint,
      log: false
    });
    
    apiext.sendSupportMessageExt(reply, projectId, requestId, token, () => {
      if (log) {
        // console.log("SupportMessageExt() reply sent:", JSON.stringify(reply));
      }
    });
  }
  
});

// async function botById(botId, projectId, tdcache, botsDS) {
//   let bot = null;
//   // let botCacheKey = "cacheman:cachegoose-cache:" + projectId + ":faq_kbs:id:" + botId;
//   let botCacheKey = "cacheman:cachegoose-cache:faq_kbs:id:" + botId;
//   try {
//     let _bot_as_string = await tdcache.get(botCacheKey);
//     const value_type = typeof _bot_as_string;
//     console.log("_bot_as_string found in chache:", _bot_as_string);
//     console.log("value_type:", value_type);
//     if (_bot_as_string) {
//       bot = JSON.parse(_bot_as_string);
//       console.log("got bot from cache:", JSON.stringify(bot));
//     }
//     else {
//       console.log("bot not found, getting from datasource...");
//       bot = await botsDS.getBotById(botId);
//       console.log("bot found in datasource:", JSON.stringify(bot));
//       await tdcache.set(botCacheKey, JSON.stringify(bot));
//       // DEBUG CODE REMOVE
//       let bot_ = await tdcache.get(botCacheKey);
//       console.log("_bot_as_string from cache debug:", bot_)
//     }
//   }
//   catch(err) {
//     console.error("error getting bot by id:", err);
//   }
//   return bot;
// }

async function updateRequestVariables(chatbot, message, projectId, requestId) {
  // update request context
  const messageId = message._id;
  await chatbot.addParameter(TiledeskChatbotConst.REQ_PROJECT_ID_KEY, projectId);
  // TODO add projectName too
  await chatbot.addParameter(TiledeskChatbotConst.REQ_REQUEST_ID_KEY, requestId);
  if (chatbot.bot) {
    await chatbot.addParameter(TiledeskChatbotConst.REQ_CHATBOT_NAME_KEY, chatbot.bot.name);
  }
  if (message.text) {
    await chatbot.addParameter(TiledeskChatbotConst.REQ_LAST_USER_TEXT_KEY, message.text);
  }
  await chatbot.addParameter(TiledeskChatbotConst.REQ_LAST_MESSAGE_ID_KEY, messageId);
  if (message.request && message.request.location && message.request.location.country) {
    await chatbot.addParameter(TiledeskChatbotConst.REQ_COUNTRY_KEY, message.request.location.country);
  }
  if (message.request && message.request.location && message.request.location.city) {
    await chatbot.addParameter(TiledeskChatbotConst.REQ_CITY_KEY, message.request.location.city);
  }
  // console.log("message.request.language", message.request["language"])
  if (message.request) {
    await chatbot.addParameter(TiledeskChatbotConst.REQ_USER_SOURCE_PAGE_KEY, message.request.sourcePage);
    await chatbot.addParameter(TiledeskChatbotConst.REQ_USER_LANGUAGE_KEY, message.request["language"]);
    await chatbot.addParameter(TiledeskChatbotConst.REQ_USER_AGENT_KEY, message.request.userAgent);
  }
  if (message.attributes) {
    await chatbot.addParameter(TiledeskChatbotConst.REQ_DEPARTMENT_ID_KEY, message.attributes.departmentId);
    await chatbot.addParameter(TiledeskChatbotConst.REQ_DEPARTMENT_NAME_KEY, message.attributes.departmentName);
    await chatbot.addParameter(TiledeskChatbotConst.REQ_END_USER_ID_KEY, message.attributes.requester_id);
    await chatbot.addParameter(TiledeskChatbotConst.REQ_END_USER_IP_ADDRESS_KEY, message.attributes.ipAddress);
    if (message.attributes.payload) {
      try {
        for (const [key, value] of Object.entries(message.attributes.payload)) {
          // const value = all_parameters[key];
          const value_type = typeof value;
          if (chatbot.log) {console.log("importing payload parameter:", key, "value:", value, "type:", value_type)}
          await chatbot.addParameter(key, String(value));
        }
      }
      catch(err) {
        console.error("Error importing message payload in request variables:", err);
      }
    }
  }
  if (chatbot.log) {
    const all_parameters = await TiledeskChatbot.allParametersStatic(chatbot.tdcache, requestId);
    for (const [key, value] of Object.entries(all_parameters)) {
      // const value = all_parameters[key];
      const value_type = typeof value;
      if (chatbot.log) {console.log("request parameter:", key, "value:", value, "type:", value_type)}
    }
  }
  // message["attributes"]: {
  //   "departmentId": "63c980054f857c00350535bc",
  //   "departmentName": "Default Department",
  //   "client": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
  //   "sourcePage": "https://tiledesk-html-site.tiledesk.repl.co/custom-attributes.html",
  //   "projectId": "63c980054f857c00350535b8",
  //   "payload": {
  //     "user_country": "Italy",
  //     "user_code": "E001"
  //   },
  //   "userFullname": "guest#7216 ",
  //   "requester_id": "7216926a-84c3-4bd5-aa79-8bd763094dc0",
  //   "ipAddress": "79.8.190.172",
  //   "sourceTitle": "Custom attributes",
  //   "widgetVer": "v.5.0.53-rc.4",
  //   "subtype": "info",
  //   "decoded_jwt": {
  //     "_id": "7216926a-84c3-4bd5-aa79-8bd763094dc0",
  //     "firstname": "guest#7216",
  //     "id": "7216926a-84c3-4bd5-aa79-8bd763094dc0",
  //     "fullName": "guest#7216 ",
  //     "iat": 1674201892,
  //     "aud": "https://tiledesk.com",
  //     "iss": "https://tiledesk.com",
  //     "sub": "guest",
  //     "jti": "f053af3d-14ca-411b-9903-78bd74e24218"
  //   }
}

function actionsToDirectives(actions) {
  let directives = [];
  if (actions && actions.length > 0) {
    actions.forEach(action => {
      let directive = Directives.actionToDirective(action);
      if (directive) {
        directives.push(directive);
      }
    });
  }
  return directives;
}

router.post('/ext/:projectId/requests/:requestId/messages', async (req, res) => {
  res.json({success:true});
  const projectId = req.params.projectId;
  const requestId = req.params.requestId;
  const token = req.headers["authorization"];
  let answer = req.body;
  // if (log) {console.log("answer on sendSupportMessageExt:", JSON.stringify(answer));}
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
    if (log) {console.log("Request from cache:", JSON.stringify(request));}
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
      console.log("Cache request found.");
    }
    catch(err) {
      console.log("Request not found.");
    }
    if (log) {console.log("(No tdcache) Got request with APIs");}
  }
  if (!request) {
    if (log) {console.log("chatbot-pure directives still work. Tiledesk specific directives don't");}
    request = {
      request_id: requestId,
      id_project: projectId
    }
  }
  // if (log) {console.log("request....", JSON.stringify(request));}
  let directivesPlug = new DirectivesChatbotPlug({supportRequest: request, TILEDESK_API_ENDPOINT: APIURL, TILEBOT_ENDPOINT:process.env.TYBOT_ENDPOINT, token: token, log: log, HELP_CENTER_API_ENDPOINT: process.env.HELP_CENTER_API_ENDPOINT, cache: tdcache});
  // PIPELINE-EXT
  // if (log) {console.log("answer to process:", JSON.stringify(answer));}
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
    // if (!bot_answer.text) {
    //   bot_answer.text = "..."
    // }
    bot_answer.attributes["_raw_message"] = original_answer_text;
    // if (log) {console.log("bot_answer", JSON.stringify(bot_answer));}
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
  // console.log("parameters:", parameters);
  // console.log("req.query.all:", req.query.all);
  if (req.query.all != null) {
    res.send(parameters);
  }
  else {
    let userParams = {};
    if (parameters) {
      for (const [key, value] of Object.entries(parameters)) {
        // console.log(key, value);
        if (!key.startsWith("td")) {
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

async function startApp(settings, completionCallback) {
  // console.log("Starting Tilebot with Settings:", settings);

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

  if (!staticBots) {
    console.log("(Tilebot) Connecting to mongodb...");
    // connection = 
    mongoose.connect(settings.MONGODB_URI, { "useNewUrlParser": true, "autoIndex": false }, async (err) => {
      if (err) { 
        console.error('(Tilebot) Failed to connect to MongoDB on ' + settings.MONGODB_URI + " ", err);
        //process.exit(1); // add => exitOnFail: true
      }
      else {
        console.log("(Tilebot) mongodb connection ok.");
        await connectRedis();
        console.info("Tilebot started.");
        if (completionCallback) {
          completionCallback();
        }
        // if (tdcache) {
        //   try {
        //     console.log("(Tilebot) Connecting Redis...");
        //     await tdcache.connect();
        //   }
        //   catch (error) {
        //     tdcache = null;
        //     console.error("(Tilebot) Redis connection error:", error);
        //     process.exit(1);
        //   }
        //   console.log("(Tilebot) Redis connected.");
        // }
        // console.info("Tilebot started.");
        // if (completionCallback) {
        //   completionCallback();
        // }
      }
    });
  }
  else {
    console.log("(Tilebot) Using static bots.");
    await connectRedis();
    console.info("Tilebot started.");
    if (completionCallback) {
      completionCallback();
    }
  }
}

async function connectRedis() {
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
  return;
  // console.info("Tilebot started.");
  // if (completionCallback) {
  //   completionCallback();
  // }
}

module.exports = { router: router, startApp: startApp};