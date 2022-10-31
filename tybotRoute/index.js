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
  res.status(200).send({"success":true});

  const botId = req.params.botid;
  if (log) {console.log("query botId:", botId);}
  const message = req.body.payload;
  const messageId = message._id;
  const faq_kb = req.body.hook;
  const token = req.body.token;
  const requestId = message.request.request_id;
  const projectId = message.id_project;

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
  
  const chatbot = new TiledeskChatbot({
    botId: botId,
    token: token,
    faq_kb: faq_kb,
    APIURL: APIURL,
    APIKEY: "___",
    tdcache: tdcache,
    requestId: requestId,
    projectId: projectId,
    log: log
  });

  const parameters_key = "tilebot:requests:" + requestId + ":parameters";
  await chatbot.addParameter(requestId, "tdMessageId", messageId);
  all_params = await chatbot.allParameters(requestId);
  console.log("Allparams", all_params);
  let reply = await chatbot.replyTo(message);
  reply.triggeredByMessageId = messageId;
  console.log("reply ok", reply);
  let extEndpoint = `${APIURL}/modules/tilebot/`;
  if (process.env.TYBOT_ENDPOINT) {
    extEndpoint = `${process.env.TYBOT_ENDPOINT}`;
  }
  const apiext = new ExtApi({
    ENDPOINT: extEndpoint,
    log: log
  });

  apiext.sendSupportMessageExt(reply, projectId, requestId, token, () => {
    if (log) {console.log("FORM Message sent.", );}
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
  if (tdcache) {
    request = await tdcache.getJSON(request_key)
    if (log) {console.log("HIT! Request from cache:", request.request_id);}
    if (!request) {
      if (log) {console.log("!Request from cache", requestId);}
      request = await tdclient.getRequestById(requestId);
      if (log) {console.log("Got request with APIs (after no cache hit)");}
    }
  }
  else {
    if (log) {console.log("No tdcache. Getting request with APIs", requestId);}
    request = await tdclient.getRequestById(requestId);
    if (log) {console.log("(No tdcache) Got request with APIs");}
  }
  let directivesPlug = new DirectivesChatbotPlug({supportRequest: request, TILEDESK_API_ENDPOINT: APIURL, token: token, log: log, HELP_CENTER_API_ENDPOINT: process.env.HELP_CENTER_API_ENDPOINT, cache: tdcache});
  // PIPELINE-EXT
  const bot_answer = await ExtUtil.execPipelineExt(request, answer, directivesPlug, tdcache, log);
  //const bot_answer = answer;
  tdclient.sendSupportMessage(requestId, bot_answer, () => {
    directivesPlug.processDirectives(() => {
      if (log) {console.log("After message execute directives end.");}
    });
  });
});

/*
async function execFaq(req, res, faqs, botId, message, token, bot) {
  answerObj = faqs[0];
  //console.log("answerObj:", answerObj)
  let sender = 'bot_' + botId;
  var answerObj;
  answerObj.score = 100; //exact search not set score

  const requestId = message.request.request_id;
  const projectId = message.id_project;
  //console.log("requestId:", requestId)
  //console.log("token:", token)
  //console.log("projectId:", projectId)
  
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
  let intent_form = answerObj.form;
  let intent_name = answerObj.intent_display_name
  if (intent_name === "test_form_intent") {
    intent_form = {
      "name": "form_name",
      "id": "form_id",
      "cancelCommands": ['annulla', 'cancella', 'reset', 'cancel'],
      "cancelReply": "Form Annullata",
      "fields": [
        {
          "name": "userFullname",
          "type": "text",
          "label": "What is your name?"
        },{
          "name": "companyName",
          "type": "text",
          "label": "Thank you ${userFullname}! What is your Company name?"
        },
        {
          "name": "userEmail",
          "type": "text",
          "regex": "/^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/",
          "label": "Hi ${userFullname} from ${companyName}\n\nJust one last question\n\nYour email 🙂",
          "errorLabel": "${userFullname} this email address is invalid\n\nCan you insert a correct email address?"
        }
      ]
    };
  }
  
  if (intent_form) {
    await lockIntent(requestId, intent_name);
    const user_reply = message.text;
    const intent_answer = req.body.payload.text;
    let form_reply = await execIntentForm(user_reply, intent_answer, requestId, intent_form);
    console.log("got form reply", form_reply)
    //if (form_reply_message) {
    if (!form_reply.canceled && form_reply.message) {
      console.log("Form replying for next field...");
      if (log) {console.log("Sending form reply...", form_reply_message)}
      // reply with this message (ex. please enter your fullname)
      if (!form_reply.message.attributes) {
        form_reply.message.attributes = {}
      }
      form_reply.message.attributes.fillParams = true;
      form_reply.message.attributes.splits = true;
      apiext.sendSupportMessageExt(form_reply.message, projectId, requestId, token, () => {
        if (log) {console.log("FORM Message sent.", );}
      });
      return;
    }
    else if (form_reply.end) {
      console.log("Form end.");
      if (log) {console.log("unlocking intent for request", requestId);}
      unlockIntent(requestId);
      populatePrechatFormAndLead(message, projectId, token, APIURL);
    }
    else if (form_reply.canceled) {
      console.log("Form canceled.");
      if (log) {console.log("unlocking intent due to canceling, for request", requestId);}
      unlockIntent(requestId);
      if (log) {console.log("sending form 'cancel' reply...", form_reply.message)}
      // reply with this message (ex. please enter your fullname)
      if (!form_reply.message.attributes) {
        form_reply.message.attributes = {}
      }
      form_reply.message.attributes.fillParams = true;
      form_reply.message.attributes.splits = true;
      apiext.sendSupportMessageExt(form_reply.message, projectId, requestId, token, () => {
        if (log) {console.log("FORM Message sent.", );}
      });
      return;
    }
    console.log("form_reply is", form_reply)
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
    if (log) {console.log("Message sent");}
  });
  
}*/

/*
async function populatePrechatFormAndLead(message, projectId, token, APIURL, callback) {
  const tdclient = new TiledeskClient({
    projectId: projectId,
    token: token,
    APIURL: APIURL,
    APIKEY: "___"
  });
  
  const leadId = message.request.lead._id;
  const requestId = message.request.request_id;

  const parameters_key = "tilebot:requests:" + requestId + ":parameters";
  const all_parameters = await tdcache.hgetall(parameters_key);
  if (all_parameters) {
    //console.log("all_parameters['userEmail']", all_parameters['userEmail'])
    //console.log("all_parameters['userFullname']", all_parameters['userFullname']); 
    tdclient.updateLeadEmailFullname(leadId, null, all_parameters['userFullname'], () => {
      if (log) {console.log("lead updated.")}
      tdclient.updateRequestAttributes(requestId, {
        preChatForm: all_parameters,
        updated: Date.now
      }, () => {
        if (log) {console.log("prechat updated.");}
        if (callback) {
          callback();
        }
      });
    });
  };
}

*/


/** TEST BUG
  function fixToken(token) {
    if (token.startsWith('JWT ')) {
      return token;
    }
    else {
      return 'JWT ' + token;
    }
  }

function sendSupportMessageExt(message, projectId, requestId, token, callback) {
  let extEndpoint = `${APIURL}/modules/tilebot/`;
  if (process.env.TYBOT_ENDPOINT) {
    extEndpoint = `${process.env.TYBOT_ENDPOINT}`;
  }
    const jwt_token = fixToken(token);
    const url = `${extEndpoint}/ext/${projectId}/requests/${requestId}/messages`;
    if (this.log) {console.log("sendSupportMessageExt URL", url);}
    //console.log("sendSupportMessageExt:", url);
    const HTTPREQUEST = {
      url: url,
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': jwt_token
      },
      json: message,
      method: 'POST'
    };
    myrequest(
      HTTPREQUEST,
      function(err, resbody) {
        //console.log("sendSupportMessageExt resbody:", resbody);
        if (err) {
          //console.error("sendSupportMessageExt error:", err)
          if (callback) {
            callback(err);
          }
        }
        else {
          if (callback) {
            console.log("resbody:", resbody);
            callback(null, resbody);
          }
        }
      }, this.log
    );
  }


  function myrequest(options, callback, log) {
    //console.log("API URL:", options.url);
    axios(
      {
        url: options.url,
        method: options.method,
        data: options.json,
        params: options.params,
        headers: options.headers
      })
    .then((res) => {
      //console.log("Response for url:", options.url);
      //console.log("Response headers:\n", res.headers);
      if (res && res.status == 200 && res.data) {
        if (callback) {
          callback(null, res.data);
        }
      }
      else {
        if (callback) {
          callback(TiledeskClient.getErr({message: "Response status not 200"}, options, res), null, null);
        }
      }
    })
    .catch( (error) => {
      console.error("An error occurred:", error);
      if (callback) {
        callback(error, null, null);
      }
    });
  }
  *** END TEST*/





/*
async function execIntentForm(userInputReply, original_intent_answer_text, requestId, form) {
  if (log) {console.log("executing intent form...")}
  let intentForm = new IntentForm({form: form, requestId: requestId, db: tdcache, log: log});
  let message = await intentForm.getMessage(userInputReply, original_intent_answer_text);
  return message;
}
*/

/*
async function lockIntent(requestId, intent_name) {
  await tdcache.set("tilebot:requests:"  + requestId + ":locked", intent_name);
  //console.log("locked.", intent_name);
}

async function currentLockedIntent(requestId) {
  return await tdcache.get("tilebot:requests:"  + requestId + ":locked");
}

async function unlockIntent(requestId) {
  await tdcache.del("tilebot:requests:"  + requestId + ":locked");
}
*/

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

/*
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
*/

/*
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

router.get('/', (req, res) => {
  res.send('Hello Tilebot!');
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
  console.log("(Tybot) Starting Tilebot connector v" + pjson.version);
  console.log("(Tybot) Connecting to mongodb...");

  connection = mongoose.connect(settings.MONGODB_URI, { "useNewUrlParser": true, "autoIndex": false }, async (err) => {
    if (err) { 
      console.error('(Tybot) Failed to connect to MongoDB on ' + settings.MONGODB_URI + " ", err);
      //process.exit(1); // add => exitOnFail: true
    }
    else {
      console.log("(Tybot) mongodb connection ok.");
      if (tdcache) {
        try {
          await tdcache.connect();
        }
        catch (error) {
          tdcache = null;
          console.error("(Tybot) tdcache (Redis) connection error:", error);
        }
        console.log("(Tybot) tdcache (Redis) connected.");
      }
      console.info("Tybot started.");
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