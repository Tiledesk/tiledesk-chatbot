const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
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
const { TiledeskChatbotUtil } = require('./models/TiledeskChatbotUtil.js'); //require('@tiledesk/tiledesk-chatbot-util');
const AiService = require('./TiledeskServices/AIService.js');
let API_ENDPOINT = null;
let TILEBOT_ENDPOINT = null;
let staticBots;

router.post('/ext/:botid', async (req, res) => {
  const botId = req.params.botid;
  if (log) {console.log("(tybotRoute) POST /ext/:botid called: ", botId);}
  if(!botId || botId === "null" || botId === "undefined"){
    return res.status(400).send({"success": false, error: "Required parameters botid not found. Value is 'null' or 'undefined'"})
  }

  if (req && req.body && req.body.payload && req.body.payload.request && req.body.payload.request.snapshot) {
    delete req.body.payload.request.snapshot;
    console.log("Removed req.body.payload.request.snapshot field");
  }
  if (log) {console.log("REQUEST BODY:", JSON.stringify(req.body));}

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

 /** MANAGE AUDIO FILE MESSAGE */ 
 let aiService = new AiService({
    API_ENDPOINT: API_ENDPOINT,
    TOKEN: token,
    PROJECT_ID: projectId
  })
  let isAudio = TiledeskChatbotUtil.isAudioMessage(message)
  if(isAudio){
    let responseText = await aiService.speechToText(message.metadata.src).catch(err => {
      if(log) console.log('(index.js) aiService.speechToText error: ', err)
    })
    if(responseText && responseText.text)
      message.text = responseText.text
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
    botsDS = new MongodbBotsDataSource({projectId: projectId, botId: botId, log: log});
    if (log) {console.log("botsDS created with Mongo");}
  }
  else {
    botsDS = new MockBotsDataSource(staticBots);
    // console.log("botDA.data.........", botsDS.data);
  }
  
  // get the bot metadata
  let bot = await botsDS.getBotByIdCache(botId, tdcache).catch((err)=> {
    Promise.reject(err);
    return;
  });
  // let bot = null;
  // try {
  //   // bot = await botsDS.getBotById(botId);
  //   // bot = await botById(botId, projectId, tdcache, botsDS);
  //   bot = await botsDS.getBotByIdCache(botId, tdcache);
  //   // console.log("getBotByIdCache ---> bot: ", JSON.stringify(bot, null, 2))
  // }
  // catch(error) {
  //   console.error("Error getting botId:", botId);
  //   console.error("Error getting bot was:", error);
  //   return;
  // }
  // if (log) {console.log("bot found:", JSON.stringify(bot));}
  
  let intentsMachine;
  let backupMachine;
  if (!staticBots) {
    intentsMachine = IntentsMachineFactory.getMachine(bot, botId, projectId, log);
    backupMachine = IntentsMachineFactory.getBackupMachine(bot, botId, projectId, log);
    if (log) {console.log("Created backupMachine:", backupMachine);}
  }
  else {
    intentsMachine = {}
  }

  // let intentsMachine;
  // if (!staticBots) {
  //   if (log) {console.log("intentsMachine to MongoDB");}
  //   intentsMachine = new MongodbIntentsMachine({projectId: projectId, language: bot.language, log});
  //   if (bot.intentsEngine === "tiledesk-ai") {
  //     if (log) {console.log("intentsMachine to tiledesk-ai");}
  //     intentsMachine = new TiledeskIntentsMachine(
  //       {
  //         //projectId: projectId,
  //         //language: bot.language,
  //         botId: botId
  //         //TILEBOT_AI_ENDPOINT: process.env.TILEBOT_AI_ENDPOINT
  //       });
  //   }
  // }
  // else {
  //   intentsMachine = {}
  // }
  //const intentsMachine = new TiledeskIntentsMachine({API_ENDPOINT: "https://MockIntentsMachine.tiledesk.repl.co", log: true});
  // console.log("the bot is:", bot)
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
  if (log) {console.log("MESSAGE CONTAINS:", message.text);}
  // if (message.text === "\\\\start") { // patch for the misleading \\start training phrase
  //   if (log) {console.log("forced conversion of \\\\start /start");}
  //   message.text = "/start";
  // }
  await TiledeskChatbotUtil.updateRequestAttributes(chatbot, token, message, projectId, requestId);
  if (requestId.startsWith("support-group-")) {
    await TiledeskChatbotUtil.updateConversationTranscript(chatbot, message);
  }

  let reply = null;
  try {
    reply = await chatbot.replyToMessage(message);
  }
  catch(err) {
    console.error("(tybotRoute) An error occurred replying to message:", JSON.stringify(message), "\nError:", err );
    return;
  }
  if (!reply) {
    if (log) { console.log("(tybotRoute) No reply. Stop flow.") }
    return;
  }
  
  // console.log("reply is:", reply);
  // if (reply.attributes.intent_info.intent_id) {
  //   process.exit(1)
  // }
  if (reply.actions && reply.actions.length > 0) { // structured actions (coming from chatbot designer)
    try {
      if (log) {console.log("the actions:", JSON.stringify(reply.actions));}
      let directives = TiledeskChatbotUtil.actionsToDirectives(reply.actions);
      if (log) {console.log("the directives:", JSON.stringify(directives));}
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
        if (log) {console.log("Actions - Directives executed.");}
      });
    }
    catch (error) {
      console.error("Error while processing actions:", error);
    }
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
    
    const apiext = new ExtApi({
      TILEBOT_ENDPOINT: TILEBOT_ENDPOINT,
      log: false
    });
    apiext.sendSupportMessageExt(reply, projectId, requestId, token, () => {
      if (log) {
        //console.log("SupportMessageExt() reply sent:", JSON.stringify(reply));
      }
    });
  }
  
});

router.post('/ext/:projectId/requests/:requestId/messages', async (req, res) => {
  res.json({success:true});
  const projectId = req.params.projectId;
  const requestId = req.params.requestId;
  const token = req.headers["authorization"];
  if (log) {console.log("/ext projectId:", projectId);}
  if (log) {console.log("/ext requestId:", requestId);}
  if (log) {console.log("/ext req.headers:", req.headers);}
  if (log) {console.log("/ext token:", token);}
  
  let answer = req.body;
  if (log) {console.log("/ext => answer on sendSupportMessageExt:", JSON.stringify(answer));}
  const tdclient = new TiledeskClient({
    projectId: projectId,
    token: token,
    APIURL: API_ENDPOINT,
    APIKEY: "___",
    log: false
  });
  let request;
  // const request_key = "tilebot:" + requestId;
  // if (log) {console.log("request_key:", request_key);}
  // if (tdcache) {
  //   request = await tdcache.getJSON(request_key)
  //   if (log) {console.log("Request from cache:", JSON.stringify(request));}
  //   if (!request) {
  //     if (log) {console.log("!Request from cache", requestId);}
  //     try {
  //       request = await tdclient.getRequestById(requestId);
  //     }
  //     catch(err) {
  //       console.error("Error getting the request:", err)
  //     }
  //     if (log) {console.log("Got request with APIs (after no cache hit)");}
  //   }
  // }
  // else {
    // if (log) {console.log("No tdcache. Getting request with APIs", requestId);}
  try {
    request = await tdclient.getRequestById(requestId);
    // console.log("Cache request found.");
  }
  catch(err) {
    console.error("/ext => Request not found:", requestId);
  }
    // if (log) {console.log("(No tdcache) Got request with APIs");}
  // }
  if (!request) {
    if (log) {console.log("/ext => Creating new Request. Chatbot-pure directives still work. Tiledesk specific directives don't");}
    const request_botId_key = "tilebot:botId_requests:" + requestId;
    const botId = await tdcache.get(request_botId_key);
    if (log) {console.log("/ext => current botId [" + request_botId_key + "]:", botId);}
    request = {
      request_id: requestId,
      id_project: projectId,
      bot_id: botId
    }
  }
  if (log) {
    console.log("/ext request....", JSON.stringify(request));
    console.log("/ext API_ENDPOINT....", API_ENDPOINT);
    console.log("/ext process.env.TILEBOT_ENDPOINT....", TILEBOT_ENDPOINT);
  }
  let directivesPlug = new DirectivesChatbotPlug({supportRequest: request, API_ENDPOINT: API_ENDPOINT, TILEBOT_ENDPOINT: TILEBOT_ENDPOINT, token: token, log: log, HELP_CENTER_API_ENDPOINT: process.env.HELP_CENTER_API_ENDPOINT, cache: tdcache});
  // let directivesPlug = null;
  // PIPELINE-EXT
  // if (log) {console.log("answer to process:", JSON.stringify(answer));}
  const original_answer_text = answer.text;
  const bot_answer = await ExtUtil.execPipelineExt(request, answer, directivesPlug, tdcache, log);
  if (log) {console.log("/ext => bot_answer", JSON.stringify(bot_answer))}
  if (bot_answer) {
    if (log) {console.log("/ext => adding to bot_answer original_answer_text:", JSON.stringify(original_answer_text));}
    if (!bot_answer.attributes) {
      bot_answer.attributes = {};
    }
    // if (!bot_answer.text) {
    //   bot_answer.text = "..."
    // }
    bot_answer.attributes["_raw_message"] = original_answer_text;
    // if (log) {console.log("bot_answer", JSON.stringify(bot_answer));}
    tdclient.sendSupportMessage(requestId, bot_answer, (err, response) => {
      if (log) {console.log("/ext => bot_answer sent:", JSON.stringify(bot_answer));}
      if (err) {
        console.error("/ext => Error sending message", JSON.stringify(err));
      }
      directivesPlug.processDirectives( () => {
        if (log) {console.log("After message - Directives executed.");}
      });
    });
  }
  else {
    if (log) {console.log("/ext => !bot_answer");}
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
    // const RESERVED = [
    //   TiledeskChatbotConst.REQ_CHATBOT_NAME_KEY,
    //   TiledeskChatbotConst.REQ_CHAT_URL,
    //   TiledeskChatbotConst.REQ_CITY_KEY,
    //   TiledeskChatbotConst.REQ_COUNTRY_KEY,
    //   TiledeskChatbotConst.REQ_DEPARTMENT_ID_KEY,
    //   TiledeskChatbotConst.REQ_DEPARTMENT_NAME_KEY,
    //   TiledeskChatbotConst.REQ_END_USER_ID_KEY,
    //   TiledeskChatbotConst.REQ_END_USER_IP_ADDRESS_KEY,
    //   TiledeskChatbotConst.REQ_LAST_MESSAGE_ID_KEY,
    //   TiledeskChatbotConst.REQ_LAST_USER_TEXT_KEY,
    //   TiledeskChatbotConst.REQ_PROJECT_ID_KEY,
    //   TiledeskChatbotConst.REQ_REQUEST_ID_KEY,
    //   TiledeskChatbotConst.REQ_USER_AGENT_KEY,
    //   TiledeskChatbotConst.REQ_USER_LANGUAGE_KEY,
    //   TiledeskChatbotConst.REQ_USER_SOURCE_PAGE_KEY,
    //   TiledeskChatbotConst.REQ_LAST_USER_MESSAGE_TYPE_KEY,
    //   TiledeskChatbotConst.REQ_TRANSCRIPT_KEY,
    //   TiledeskChatbotConst.REQ_LAST_USER_MESSAGE_KEY,
    //   TiledeskChatbot.REQ_DECODED_JWT_KEY,
    //   "lastUserImageURL", // image
    //   "lastUserImageName", // image
    //   "lastUserImageWidth", // image
    //   "lastUserImageHeight", // image
    //   "lastUserImageType", // image
    //   "lastUserDocumentURL", // file
    //   "lastUserDocumentName", // file
    //   "lastUserDocumentType", // file
    //   "ticketId",
    //   TiledeskChatbotConst.REQ_CHAT_CHANNEL,
    //   "user_lead_id",
    //   "lastUserText",
    //   TiledeskChatbotConst.REQ_REQUESTER_IS_AUTHENTICATED_KEY,
    //   "userInput"
    // ]
    // let userParams = {};
    // if (parameters) {
    //   for (const [key, value] of Object.entries(parameters)) {
    //     // console.log(key, value);
    //     // There is a bug that moves the requestId as a key in request attributes, so: && !key.startsWith("support-group-")
    //     if (!key.startsWith("_") && !RESERVED.some(e => e === key) && !key.startsWith("support-group-")) {
    //       userParams[key] = value;
    //     }
    //   }
    // }
    const userParams = TiledeskChatbotUtil.userFlowAttributes(parameters);
    res.send(userParams);
  }
});

router.get('/ext/parameters/requests/:requestid', async (req, res) => {
  // console.log("Checking authorization...");
  // const authorization = req.headers["authorization"];
  // if (!authorization) {
  //   console.log("No authorization header...");
  //   res.status(401).send("Unauthorized");
  //   return;
  // }
  // const token = req.headers["authorization"];
  // const publicKey = process.env.GLOBAL_SECRET_OR_PUB_KEY;
  // console.log("Got public key:", publicKey);
  // const _decoded = null;
  // jwt.verify(token, publicKey, function (err, decoded) {
  //   _decoded = decoded;
  // });
  // console.log("Authorization header field checking", req.headers["authorization"]);
  

  const requestId = req.params.requestid;
  if (!requestId) {
    res.status(404).send("Not found");
    return;
  }
  const request_parts = requestId.split("-");
  if (request_parts && request_parts.length >= 4) {
    const project_id = request_parts[2];
    // console.log("ProjectId:", project_id);
    if (project_id !== "656054000410fa00132e5dcc") { //&& project_id !== "ANOTHER P_ID"
      res.status(401).send("Unauthorized");
      return;
    }
  }
  else if (!request_parts || ( request_parts && request_parts.length < 4) ) {
    res.status(500).send("Invalid request ID");
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
    const RESERVED = [
      TiledeskChatbotConst.REQ_CHATBOT_NAME_KEY,
      TiledeskChatbotConst.REQ_CHATBOT_ID_KEY,
      TiledeskChatbotConst.REQ_CHAT_URL,
      TiledeskChatbotConst.REQ_CITY_KEY,
      TiledeskChatbotConst.REQ_COUNTRY_KEY,
      TiledeskChatbotConst.REQ_DEPARTMENT_ID_KEY,
      TiledeskChatbotConst.REQ_DEPARTMENT_NAME_KEY,
      TiledeskChatbotConst.REQ_END_USER_ID_KEY,
      TiledeskChatbotConst.REQ_END_USER_IP_ADDRESS_KEY,
      TiledeskChatbotConst.REQ_LAST_MESSAGE_ID_KEY,
      TiledeskChatbotConst.REQ_LAST_USER_TEXT_KEY,
      TiledeskChatbotConst.REQ_PROJECT_ID_KEY,
      TiledeskChatbotConst.REQ_REQUEST_ID_KEY,
      TiledeskChatbotConst.REQ_USER_AGENT_KEY,
      TiledeskChatbotConst.REQ_USER_LANGUAGE_KEY,
      TiledeskChatbotConst.REQ_USER_SOURCE_PAGE_KEY,
      TiledeskChatbotConst.REQ_LAST_USER_MESSAGE_TYPE_KEY,
      TiledeskChatbotConst.REQ_TRANSCRIPT_KEY,
      TiledeskChatbotConst.REQ_LAST_USER_MESSAGE_KEY,
      "lastUserImageURL", // image
      "lastUserImageName", // image
      "lastUserImageWidth", // image
      "lastUserImageHeight", // image
      "lastUserImageType", // image
      "lastUserDocumentURL", // file
      "lastUserDocumentName", // file
      "lastUserDocumentType" // file
    ]
    let userParams = {};
    if (parameters) {
      for (const [key, value] of Object.entries(parameters)) {
        // console.log(key, value);
        // There is a bug that moves the requestId as a key in request attributes, so: && !key.startsWith("support-group-")
        if (!key.startsWith("_") && !RESERVED.some(e => e === key) && !key.startsWith("support-group-")) {
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

router.get('/test/webrequest/get/plain/:username', async (req, res) => {
  res.send(`Application var ${req.params['username']}`);
});

router.post('/test/webrequest/post/plain', async (req, res) => {
  console.log("/post/plain req.body:", req.body);
  if (req && req.body && req.body.name) {
    res.send("Your name is " + req.body.name);
  }
  else {
    res.send("No HTTP POST provided");
  }
});

router.post('/echobot', (req, res) => {
  //console.log('echobot message body.payload: ', JSON.stringify(req.body.payload));
  const message = req.body.payload;
  const token = req.body.token;
  const requestId = message.request.request_id;
  const projectId = message.id_project;

  // console.log("/echobot projectId:", projectId);
  // console.log("/echobot requestId:", requestId);
  // console.log("/echobot token:", token);
  
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
      console.error("Error sending message:"); //, err);
    }
    else {
      //console.log("message sent.");
    }
  });
});

router.post('/block/:project_id/:bot_id/:block_id', async (req, res) => {

  const project_id = req.params.project_id;
  const bot_id = req.params.bot_id;
  const block_id = req.params.block_id;
  const body = req.body;
  const async = body.async;
  delete body.async;
  
  // invoke block
  // unique ID for each execution
  const execution_id = uuidv4().replace(/-/g, '');
  const request_id = "automation-request-" + project_id + "-" + execution_id;
  const command = "/" + block_id;
  let message = {
    payload: {
      recipient: request_id,
      text: command,
      id_project: project_id,
      request: {
        request_id: request_id
      },
      attributes: {
        payload: body
      }
    },
    token: "NO-TOKEN"
  }

  if (async) {
    console.log("Async webhook");
    sendMessageToBot(TILEBOT_ENDPOINT, message, bot_id, (err, resbody) => {
      console.log("Async resbody:\n", resbody);
      console.log("Async webhook message sent:\n", message);
      
      if (err) {
        console.error("Async resbody:\n", err);
        return res.status(500).send({ success: false, error: err });
      }

      return res.status(200).send({ success: true });
      
    })
  } else {
    
    console.log("Sync webhook. Subscribe and await for reply...")
    const topic = `/webhooks/${request_id}`;
    
    try {

      const listener = async (message, topic) => {
        console.log("Web response is: ", message, "for topic", topic);
        await tdcache.unsubscribe(topic, listener);

        let json = JSON.parse(message);
        let status = json.status ? json.status : 200;
        console.log("Web response status: ", status);

        return res.status(status).send(json.payload);
      }
      await tdcache.subscribe(topic, listener);

    } catch(err) {
      console.error("Error cache subscribe ", err);
      return res.status(500).send({ success: false, error: "Error during cache subscription"})
    }

    sendMessageToBot(TILEBOT_ENDPOINT, message, bot_id, () => {
      console.log("Sync webhook message sent: ", message);
    })
  }

});

// draft webhook
// router.post('/block/:project_id/:bot_id/:block_id', async (req, res) => {
//   const project_id = req.params['project_id'];
//   const bot_id = req.params['bot_id'];
//   const block_id = req.params['block_id'];
//   const body = req.body;
//   if (this.log) {
//     console.log("/block/ .heders:", JSON.stringify(req.headers));
//     console.log("/block/ .body:", JSON.stringify(body));
//   }
  
//   // console.log('/block/:project_id/:bot_id/:block_id:', project_id, "/", bot_id, "/", block_id);
//   // console.log('/block/:project_id/:bot_id/:block_id.body', body);
  
//   // invoke block
//   // unique ID for each execution
//   const execution_id = uuidv4().replace(/-/g, '');
//   const request_id = "automation-request-" + project_id + "-" + execution_id;
//   const command = "/" + block_id;
//   let request = {
//     "payload": {
//       "recipient": request_id,
//       "text": command,
//       "id_project": project_id,
//       "request": {
//         "request_id": request_id
//       },
//       "attributes": {
//         "payload": body
//       }
//     },
//     "token": "NO-TOKEN"
//   }
//   if (this.log) {console.log("sendMessageToBot()...", JSON.stringify(request));}
//   sendMessageToBot(TILEBOT_ENDPOINT, request, bot_id, async () => {
//     res.status(200).send({"success":true});
//     return;
//   });
// });

async function startApp(settings, completionCallback) {
  console.log("Starting Tilebot...");
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
    API_ENDPOINT = settings.API_ENDPOINT;
    console.log("(Tilebot) settings.API_ENDPOINT:", API_ENDPOINT);
  }

  if (!settings.TILEBOT_ENDPOINT) {
    TILEBOT_ENDPOINT = `${API_ENDPOINT}/modules/tilebot`
  }
  else {
    TILEBOT_ENDPOINT = settings.TILEBOT_ENDPOINT
  }
  console.log("(Tilebot) settings.TILEBOT_ENDPOINT:", TILEBOT_ENDPOINT);


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


  if (process.env.CHATBOT_MAX_STEPS) {
    MAX_STEPS = Number(process.env.CHATBOT_MAX_STEPS);
  }

  if (process.env.CHATBOT_MAX_EXECUTION_TIME) {
    MAX_EXECUTION_TIME = Number(process.env.CHATBOT_MAX_EXECUTION_TIME);// test // prod1000 * 3600 * 4; // 4 hours
  }

  console.log("(Tilebot) MAX_STEPS: ", MAX_STEPS)
  console.log("(Tilebot) MAX_EXECUTION_TIME: ", MAX_EXECUTION_TIME)

  var pjson = require('./package.json');
  console.log("(Tilebot) Starting Tilebot connector v" + pjson.version);

  if (!staticBots) {
    console.log("(Tilebot) Connecting to mongodb...");
    // connection = 
    mongoose.connect(settings.MONGODB_URI, { "useNewUrlParser": true, "autoIndex": false }, async (err) => {
      if (err) { 
        console.error('(Tilebot) Failed to connect to MongoDB on ' + settings.MONGODB_URI + " ", err);
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
  console.log("sendMessageToBot URL", url);
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
  if (log) {
    console.log("API URL:", options.url);
    console.log("** Options:", JSON.stringify(options));
  }
  axios(
    {
      url: options.url,
      method: options.method,
      data: options.json,
      params: options.params,
      headers: options.headers
    })
    .then((res) => {
      if (log) {
        console.log("Response for url:", options.url);
        console.log("Response headers:\n", JSON.stringify(res.headers));
        //console.log("******** Response for url:", res);
      }
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
    })
    .catch((error) => {
      console.error("(tybotRoute index) An error occurred:", JSON.stringify(error), "url:", options.url);
      if (callback) {
        callback(error, null, null);
      }
    }
  );
}

module.exports = { router: router, startApp: startApp};