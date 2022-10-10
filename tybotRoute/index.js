const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
var cors = require('cors');
let path = require("path");
let fs = require('fs');
const { TiledeskChatbotClient } = require('@tiledesk/tiledesk-chatbot-client');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { ExtApi } = require('./ExtApi.js');
const { ExtUtil } = require('./ExtUtil.js');
const { TdCache } = require('./TdCache.js');
const { IntentForm } = require('./IntentForm.js');

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
let Faq = require('./models/faq');
let Faq_kb = require('./models/faq_kb');
let connection;
let APIURL = null;

router.post('/ext/:botid', async (req, res) => {
  if (log) {console.log("REQUEST BODY:", JSON.stringify(req.body));}
  res.status(200).send({"success":true});

  const botId = req.params.botid;
  if (log) {console.log("query botId:", botId);}
  const message = req.body.payload;
  const faq_kb = req.body.hook;
  const token = req.body.token;
  
  //const bot = await Faq_kb.findById(botId).exec();
  const bot = await Faq_kb.findById(botId).select('+secret').exec();
  if (log) {console.log("bot:", bot);}
  
  console.log("bot:", bot);
  const locked_intent = await currentLockedIntent(message.request.request_id);
  console.log("got locked intent", locked_intent)
  if (locked_intent) {
    const tdclient = new TiledeskClient({
      projectId: message.id_project,
      token: token,
      APIURL: APIURL,
      APIKEY: "___",
      log: false
    });
    const faqs = await tdclient.getIntents(botId, locked_intent, 0, 0, null);
     console.log("got faqs", faqs)
    execFaq(req, res, faqs, botId, message, token, bot);
    return;
  }
  // CREATE TOKEN
  //var botWithSecret = await Faq_kb.findById(bot._id).select('+secret').exec();
/*
  let signOptions = {
    issuer:  'https://tiledesk.com',
    subject:  'bot',
    audience:  'https://tiledesk.com/bots/'+bot._id,   
    jwtid: uuidv4()
  };

  // DEPRECATED, REMOVE
  const bot_token = jwt.sign(bot.toObject(), bot.secret, signOptions);
  //console.log("bot_token:", bot_token);
  */
  // SETUP EXACT MATCH
  let query = { "id_project": message.id_project, "id_faq_kb": botId, "question": message.text };
  // BUT CHECKING ACTION BUTTON...
  if (message.attributes && message.attributes.action) {
    var action = message.attributes.action;
    var action_parameters_index = action.indexOf("?");
    if (action_parameters_index > -1) {
        action = action.substring(0, action_parameters_index);
    }
    // console.debug("action: " + action);
    query = { "id_project": message.id_project, "id_faq_kb": botId, "intent_display_name": action };
    //var isObjectId = mongoose.Types.ObjectId.isValid(action);
    //console.debug("isObjectId:" + isObjectId);
    //if (isObjectId) {
    //    query = { "id_project": message.id_project, "id_faq_kb": botId, "_id": action };
    //} else {
    // query = { "id_project": message.id_project, "id_faq_kb": botId, $or: [{ "intent_id": action }, { "intent_display_name": action }] };
    //}
  }
  
  // SEARCH INTENTS
  Faq.find(query).lean().exec(async (err, faqs) => {
    if (err) {
      return console.error("Error getting faq object.", err);
    }
    if (faqs && faqs.length > 0 && faqs[0].answer) {
      if (log) {console.log("EXACT MATCH FAQ:", faqs[0]);}
      execFaq(req, res, faqs, botId, message, token, bot); // bot_token
    }
    else { // FULL TEXT
      if (log) {console.log("NLP decode intent...");}
      query = { "id_project": message.id_project, "id_faq_kb": botId };
      var mongoproject = undefined;
      var sort = undefined;
      var search_obj = { "$search": message.text };

      if (faq_kb.language) {
          search_obj["$language"] = faq_kb.language;
      }
      query.$text = search_obj;
      //console.debug("fulltext search query", query);

      mongoproject = { score: { $meta: "textScore" } };
      sort = { score: { $meta: "textScore" } } 
      // DA QUI RECUPERO LA RISPOSTA DATO (ID: SE EXT_AI) (QUERY FULLTEXT SE NATIVE-BASIC-AI)
      Faq.find(query, mongoproject).sort(sort).lean().exec(async (err, faqs) => {
        if (log) {console.log("Found:", faqs);}
        if (err) {
          console.error("Error:", err);
          return console.error('Error getting fulltext objects.', err);
        }
        if (faqs && faqs.length > 0 && faqs[0].answer) {
          execFaq(req, res, faqs, botId, message, token, bot); // bot_token
        }
        else {
          // fallback
          const fallbackIntent = await getIntentByDisplayName("defaultFallback", bot);
          const faqs = [fallbackIntent];
          execFaq(req, res, faqs, botId, message, token, bot); // bot_token
        }
      });
    }
  });
});

router.post('/ext/:projectId/requests/:requestId/messages', async (req, res) => {
  //if (log) {console.log("REQUEST BODY:", JSON.stringify(req.body));}
  //if (log) {console.log("req.headers:", JSON.stringify(req.headers));}
  if (log) {console.log("req.headers:", JSON.stringify(req.headers));}
  const projectId = req.params.projectId;
  //console.log("projectId", projectId);
  const requestId = req.params.requestId;
  //console.log("requestId", requestId);
  const token = req.headers["authorization"];
  //console.log("Authorization", token);
  let answer = req.body;
  //console.log("Answer", answer);
  const tdclient = new TiledeskClient({
    projectId: projectId,
    token: token,
    APIURL: APIURL,
    APIKEY: "___",
    log: false
  });
  
  let request;
  const request_key = "tilebot:" + requestId;
  console.log("Getting by request key:", request_key)
  if (tdcache) {
    request = await tdcache.getJSON(request_key)
    console.log("HIT! Request from cache:", request.request_id);
    if (!request) {
      console.log("!Request from cache", requestId);
      request = await tdclient.getRequestById(requestId);
      console.log("Got request with APIs (after no cache hit)");
    }
  }
  else {
    console.log("No tdcache. Getting request with APIs", requestId);
    request = await tdclient.getRequestById(requestId);
    console.log("(No tdcache) Got request with APIs");
  }
  let directivesPlug = new DirectivesChatbotPlug({supportRequest: request, TILEDESK_API_ENDPOINT: APIURL, token: token, log: log, HELP_CENTER_API_ENDPOINT: process.env.HELP_CENTER_API_ENDPOINT, cache: tdcache});
    // PIPELINE-EXT
  const bot_answer = await ExtUtil.execPipelineExt(request, answer, directivesPlug, tdcache);
  tdclient.sendSupportMessage(requestId, bot_answer, () => {
    directivesPlug.processDirectives(() => {
      if (log) {console.log("After message execute directives end.");}
      res.json({success:true});
    });
  });
  
  /*
  tdclient.getRequestById(requestId, async (err, request) => {
    //console.log("got remote request:", request);
    let directivesPlug = new DirectivesChatbotPlug({supportRequest: request, TILEDESK_API_ENDPOINT: APIURL, token: token, log: log, HELP_CENTER_API_ENDPOINT: process.env.HELP_CENTER_API_ENDPOINT});
    // PIPELINE-EXT
    const bot_answer = await ExtUtil.execPipelineExt(answer, directivesPlug);
    //if (!validMessage(bot_answer)) {
    //  console.log("Empty message. Cancel sending.");
    //  res.json({success:true});
    //  return;
    //}
    tdclient.sendSupportMessage(requestId, bot_answer, () => {
      directivesPlug.processDirectives(() => {
        if (log) {console.log("After message execute directives end.");}
        res.json({success:true});
      });
    });
  });
  */
});

async function execFaq(req, res, faqs, botId, message, token, bot) {
  answerObj = faqs[0];
  console.log("answerObj:", answerObj)
  let sender = 'bot_' + botId;
  var answerObj;
  answerObj.score = 100; //exact search not set score

  const requestId = message.request.request_id;
  const projectId = message.id_project;
  console.log("requestId:", requestId)
  //console.log("token:", token)
  console.log("projectId:", projectId)
  
  if (tdcache) {
    const requestKey = "tilebot:" + requestId
    //console.log("Setting request key:", requestKey)
    // best effort, do not "await", go on, trust redis speed.
    tdcache.setJSON(requestKey, message.request);
    //await tdcache.setJSON(requestKey, message.request);
  }
  // /ext/:projectId/requests/:requestId/messages ENDPOINT COINCIDES
  // with API_ENDPOINT (APIRURL) ONLY WHEN THE TYBOT ROUTE IS HOSTED
  // ON THE MAIN SERVER. OTHERWISE WE USE TYBOT_ROUTE TO SPECIFY
  // THE ALTERNATIVE ROUTE.
  let extEndpoint = `${APIURL}/modules/tilebot/`;
  if (process.env.TYBOT_ENDPOINT) {
    extEndpoint = `${process.env.TYBOT_ENDPOINT}`;
  }
  const apiext = new ExtApi({
    ENDPOINT: extEndpoint,
    log: log
  });
  

  // THE FORM
  let intent_form = null
  let intent_name = answerObj.intent_display_name
  if (intent_name === "test_form_intent") {
    intent_form = {
      "name": "form_name",
      "id": "form_id",
      "fields": [
        {
          "name": "userFullname",
          "type": "text",
          "label": "What is your name?"
        },
        {
          "name": "userEmail",
          "type": "text",
          "regex": "/^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/",
          "label": "Your email?",
          "errorLabel": "This email address is invalid\n\nCan you insert a correct email address?"
        }
      ]
    }
  }
  
  if (intent_form) {
    await lockIntent(requestId, intent_name);
    const user_reply = message.text;
    const intent_answer = req.body.payload.text;
    let form_reply_message = await execIntentForm(user_reply, intent_answer, requestId, intent_form);
    if (form_reply_message) {
      console.log("sending...", form_reply_message)
      // reply with this message (ex. please enter your fullname)
      apiext.sendSupportMessageExt(form_reply_message, projectId, requestId, token, () => {
        if (log) {console.log("FORM Message sent.", );}
      });
      return;
    }
    else {
      console.log("unlocking intent for request", requestId);
      unlockIntent(requestId);
      console.log("await currentLockedIntent", await currentLockedIntent(requestId))
    }
  }

  // FORM END
  
  const context = {
    payload: {
      botId: botId,
      bot: bot,
      message: message, // USER MESSAGE (JSON)
      intent: answerObj
    },
    token: token
  };
  const static_bot_answer = { // static design of the chatbot reply
    //type: answerObj.type,
    text: answerObj.answer,
    attributes: answerObj.attributes,
    metadata: answerObj.metadata,
    // language: ?
    // channel: ? whatsapp|telegram|facebook...
  };
  if (!static_bot_answer.attributes) {
    static_bot_answer.attributes = {}
  }
  /*let attr = static_bot_answer.attributes;
  if (!attr) {
    attr = {};
  }*/
  var timestamp = Date.now();
  static_bot_answer.attributes['clienttimestamp'] = timestamp;
  if (answerObj && answerObj._id) {
    static_bot_answer.attributes._answerid = answerObj._id.toString();
  }
  // DECORATES THE FINAL ANSWER
  // question_payload = clone of user's original message
  let question_payload = Object.assign({}, message);
  delete question_payload.request;
  let clonedfaqs = faqs.slice();
  if (clonedfaqs && clonedfaqs.length > 0) {
      clonedfaqs = clonedfaqs.shift()
  }
  const intent_info = {
      intent_name: answerObj.intent_display_name,
      is_fallback: false,
      confidence: answerObj.score,
      question_payload: question_payload,
      others: clonedfaqs
  }
  static_bot_answer.attributes.intent_info = intent_info;

  static_bot_answer.attributes.directives = true;
  static_bot_answer.attributes.splits = true;
  static_bot_answer.attributes.markbot = true;
  static_bot_answer.attributes.fillParams = true;
  static_bot_answer.attributes.webhook = answerObj.webhook_enabled;

  // exec webhook (only)
  const bot_answer = await execPipeline(static_bot_answer, message, bot, context, token); 
  
  //bot_answer.text = await fillWithRequestParams(bot_answer.text, requestId); // move to "ext" pipeline
  apiext.sendSupportMessageExt(bot_answer, projectId, requestId, token, () => {
    if (log) {console.log("Message sent.");}
  });
}

/*
async function fillWithRequestParams(message_text, requestId) {
  const all_parameters = await tdcache.hgetall("tilebot:requests:" + requestId + ":parameters");
  console.log("collected parameters:", all_parameters);
  if (all_parameters) {
    for (const [key, value] of Object.entries(all_parameters)) {
      console.log("checking parameter", key)
      message_text = message_text.replace(new RegExp("(\\$\\{" + key + "\\})", 'i'), all_parameters[key]);
    }
  console.log("final:", message_text);
  }
  return message_text;
}
*/

async function execIntentForm(userInputReply, original_intent_answer_text, requestId, form) {
  console.log("executing intent form...")
  let intentForm = new IntentForm({form: form, requestId: requestId, db: tdcache});
  console.log("executing intent form...2")
  let message = await intentForm.getMessage(userInputReply, original_intent_answer_text);
  console.log("form message:", message);
  return message;
}

async function lockIntent(requestId, intent_name) {
  await tdcache.set("tilebot:requests:"  + requestId + ":locked", intent_name);
  console.log("locked.", intent_name);
}

async function currentLockedIntent(requestId) {
  return await tdcache.get("tilebot:requests:"  + requestId + ":locked");
}

async function unlockIntent(requestId) {
  await tdcache.del("tilebot:requests:"  + requestId + ":locked");
}

/*function validMessage(message) {
  console.log("validating message", message)
  if (!message.type) {
    message.type = 'text';
  }
  if (message.text === '' && message.type === 'text') {
    console.log("in-valid message", message)
    return false;
  }
  console.log("valid message", message)
  return true;
}*/

async function execPipeline(static_bot_answer, message, bot, context, token) {
  const messagePipeline = new MessagePipeline(static_bot_answer, context);
  const webhookurl = bot.webhook_url;
  messagePipeline.addPlug(new WebhookChatbotPlug(message.request, webhookurl, token));
  //messagePipeline.addPlug(directivesPlug);
  //messagePipeline.addPlug(new SplitsChatbotPlug(log));
  //messagePipeline.addPlug(new MarkbotChatbotPlug(log));
  const bot_answer = await messagePipeline.exec();
  //if (log) {console.log("End pipeline, bot_answer:", JSON.stringify(bot_answer));}
  return bot_answer;
}

function getIntentByDisplayName(name, bot) {
  return new Promise(function(resolve, reject) {
    var query = { "id_project": bot.id_project, "id_faq_kb": bot._id, "intent_display_name": name};
    if (log) {console.debug('query', query);}
    Faq.find(query).lean().exec(function (err, faqs) {
      if (err) {
        return reject();
      }
      if (log) {console.debug("faqs", faqs);}
      if (faqs && faqs.length > 0) {
        const intent = faqs[0];
        return resolve(intent);
      }
      else {
        return resolve(null);
      }
    });
  });
}

// IGNORALA
/*app.post('/extorig', (req, res) => {
  res.status(200).send({"success":true});
  const tdclient = 
    new TiledeskChatbotClient(
      {
        APIURL: apiurl(),
        request: req,
        APIKEY: '__APIKEY__'
      });
  if (tdclient.text === "\\start") {
    tdclient.sendMessage(
      {
        text: 'started',
        attributes: {
          attachment: {
            type:"template",
            buttons: [
              {
                  type: "text",
                  value: "Ok"
              }
            ]
          }
        }
      }
    );
  }
  else {
    tdclient.sendMessage({text: 'Not trained for this'});
  }
});
*/

// Tiledesk Resolution-bot webhook endpoint
/*app.post('/bot', async (req, res) => {
  console.log("Webhook. Request body: " + JSON.stringify(req.body));
  // INTENTS
  let intent = null;
  intent = req.body.payload.intent.intent_display_name;
  //const projectId = req.body.payload.bot.id_project;
  const token = req.body.token;
  const request = req.body.payload.message.request;
  //const requestId = request.request_id;
  console.log("Got intent:", intent);
  API_URL = apiurl();
  const original_answer = req.body.payload.intent.answer;
  
  const messagePipeline = new MessagePipeline();
  messagePipeline.addPlug(new DirectivesChatbotPlug(request, API_URL, token));
  messagePipeline.addPlug(new SplitsChatbotPlug());
  messagePipeline.addPlug(new MarkbotChatbotPlug());
  
  const message = {
      text: original_answer
    };
  messagePipeline.execOn(message, (_message) => {
    res.json(_message);
    console.log("End pipeline.");
  });
  
});*/





/*
function apiurl() {
  const server = "pre";
  //const server = "prod";
  const API_URL_PRE = 'https://tiledesk-server-pre.herokuapp.com';
  const API_URL_PROD = 'https://api.tiledesk.com/v2';
  // choose a server
  let API_URL = API_URL_PROD;
  if (server === 'pre') {
    API_URL = API_URL_PRE;
  }
  return API_URL;
}
*/


router.get('/', (req, res) => {
  res.send('Hello Tybot!');
});

function startApp(settings, completionCallback) {
  console.log("Starting Tybot with Settings:", settings);

  if (!settings.MONGODB_URI) {
    throw new Error("settings.MONGODB_URI is mandatory.");
  }
  if (!settings.API_ENDPOINT) {
    throw new Error("settings.API_ENDPOINT is mandatory.");
  }
  else {
    APIURL = settings.API_ENDPOINT;
    console.log("(Tybot) settings.API_ENDPOINT:", APIURL);
  }
  if (settings.REDIS_HOST && settings.REDIS_PORT && settings.CACHE_ENABLED) {
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
  console.log("(Tybot) log:", log);
  var pjson = require('./package.json');
  console.log("(Tilebot) Starting Tilebot connector v" + pjson.version);
  console.log("(Tilebot) Connecting to mongodb...");

  connection = mongoose.connect(settings.MONGODB_URI, { "useNewUrlParser": true, "autoIndex": false }, async (err) => {
    if (err) { 
      console.error('Failed to connect to MongoDB on ' + settings.MONGODB_URI + " ", err);
      //process.exit(1); // add => exitOnFail: true
    }
    else {
      if (tdcache) {
        try {
          await tdcache.connect();
        }
        catch (error) {
          tdcache = null;
          console.error("(Tilebot) tdcache (Redis) connection error:", error);
        }
        console.log("(Tilebot) tdcache (Redis) connected.");
      }
      console.info("Tilebot started.");
      if (completionCallback) {
        completionCallback();
      }
    }
  });
}

/*
var connection = mongoose.connect(process.env.mongoUrl, { "useNewUrlParser": true, "autoIndex": false }, function(err) {
  if (err) { 
    console.error('Failed to connect to MongoDB on ' + process.env.mongoUrl + " ", err);
    //process.exit(1);
  }
  else {
    console.info("Mongodb connected")
  }
});
*/

/*
  app.listen(3000, () => {
  console.log('server started');
});
*/

module.exports = { router: router, startApp: startApp};