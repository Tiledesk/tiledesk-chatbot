const express = require('express');
// const uuid = require('uuid');
const bodyParser = require('body-parser');
// var jwt = require('jsonwebtoken');
//const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { MessagePipeline } = require('./tiledeskChatbotPlugs/MessagePipeline');
const { DirectivesChatbotPlug } = require('./tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { SplitsChatbotPlug } = require('./tiledeskChatbotPlugs/SplitsChatbotPlug');
const { MarkbotChatbotPlug } = require('./tiledeskChatbotPlugs/MarkbotChatbotPlug');
const { WebhookChatbotPlug } = require('./tiledeskChatbotPlugs/WebhookChatbotPlug');
//const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');
var path = require("path");
var fs = require('fs');
//const { KVBaseReplit } = require('./KVBaseReplit');
const { TiledeskChatbotClient } = require('@tiledesk/tiledesk-chatbot-client');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// THE IMPORT
var mongoose = require('mongoose');
var Faq = require('./models/faq');
var Faq_kb = require('./models/faq_kb');
//var faqBotSupport = require('./faqBotSupport');
//const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');

const app = express();
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({ extended: true , limit: '50mb'}));

//let db = new KVBaseReplit();

app.post('/ext/:botid', async (req, res) => {
  console.log("Reques body:", req.body);
  res.status(200).send({"success":true});

  const botId = req.params.botid;
  console.log("query botId:", botId);
  const message = req.body.payload;
  const faq_kb = req.body.hook;
  const token = req.body.token;
  
  //const bot = await Faq_kb.findById(botId).exec();
  const bot = await Faq_kb.findById(botId).select('+secret').exec();
  console.log("bot:", bot);

  // CREATE TOKEN
  //var botWithSecret = await Faq_kb.findById(bot._id).select('+secret').exec();

  var signOptions = {
    issuer:  'https://tiledesk.com',
    subject:  'bot',
    audience:  'https://tiledesk.com/bots/'+bot._id,   
    jwtid: uuidv4()
  };
  const bot_token = jwt.sign(bot.toObject(), bot.secret, signOptions);
  console.log("bot_token:", bot_token);
  //
  
  // SETUP EXACT MATCH
  let query = { "id_project": message.id_project, "id_faq_kb": botId, "question": message.text };
  // BUT CHECKING ACTION BUTTON...
  if (message.attributes && message.attributes.action) {
    var action = message.attributes.action;
    var action_parameters_index = action.indexOf("?");
    if (action_parameters_index > -1) {
        action = action.substring(0, action_parameters_index);
    }
    console.debug("action: " + action);
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
    if (faqs && faqs.length > 0 && faqs[0].answer) { // EXACT MATCH!
      console.log("FAQ:", faqs[0]);
      execFaq(req, res, faqs, botId, message, bot_token, bot);
    }
    else { // FULL TEXT
      console.log("Go fulltext...");
      query = { "id_project": message.id_project, "id_faq_kb": botId };
      var mongoproject = undefined;
      var sort = undefined;
      var search_obj = { "$search": message.text };

      if (faq_kb.language) {
          search_obj["$language"] = faq_kb.language;
      }
      query.$text = search_obj;
      console.debug("fulltext search query", query);

      mongoproject = { score: { $meta: "textScore" } };
      sort = { score: { $meta: "textScore" } } 
      // DA QUI RECUPERO LA RISPOSTA DATO (ID: SE EXT_AI) (QUERY FULLTEXT SE NATIVE-BASIC-AI)
      Faq.find(query, mongoproject).sort(sort).lean().exec(async (err, faqs) => {
        console.log("Found:", faqs);
        if (err) {
          console.erro("Error:", err);
          return console.error('Error getting fulltext objects.', err);
        }
        console.debug("faqs:", faqs);
        if (faqs && faqs.length > 0 && faqs[0].answer) {
          execFaq(req, res, faqs, botId, message, bot_token, bot);
        }
        else {
          // fallback
          const fallbackIntent = await getIntentByDisplayName("defaultFallback", bot);
          const faqs = [fallbackIntent];
          execFaq(req, res, faqs, botId, message, bot_token, bot);
        }
      });
    }
  });
  
});

async function execFaq(req, res, faqs, botId, message, token, bot) {
  let sender = 'bot_' + botId;
  console.debug("sender", sender);
  var answerObj;
  answerObj = faqs[0];
  answerObj.score = 100; //exact search not set score
  console.debug("answerObj.score", answerObj.score);
  
  const context = {
    payload: {
      //text: text,
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
  static_bot_answer.attributes.directives = true;
  static_bot_answer.attributes.splits = false;
  static_bot_answer.attributes.markbot = true;
  
  static_bot_answer.attributes.webhook = answerObj.webhook_enabled;
  console.log("static_bot_answer.attributes", static_bot_answer.attributes)

  // faq[0] => PIPELINE => bot_answer
  const APIURL = "https://tiledesk-server-pre.herokuapp.com"
  const messagePipeline = new MessagePipeline(static_bot_answer, context);
  const webhookurl = bot.webhook_url;
  messagePipeline.addPlug(new WebhookChatbotPlug(message.request, webhookurl, token));
  let directivesPlug = new DirectivesChatbotPlug(message.request, APIURL, token);
  messagePipeline.addPlug(directivesPlug);
  messagePipeline.addPlug(new SplitsChatbotPlug());
  messagePipeline.addPlug(new MarkbotChatbotPlug());
  const bot_answer = await messagePipeline.exec();
  console.log("End pipeline, bot_answer:", JSON.stringify(bot_answer));
  
  var attr = bot_answer.attributes;
  if (!attr) {
    attr = {};
  }
  var timestamp = Date.now();
  attr['clienttimestamp'] = timestamp;
  if (answerObj && answerObj._id) {
    attr._answerid = answerObj._id.toString();
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
  console.debug("intent_info", intent_info);
  attr.intent_info = intent_info;
  const tdclient = new TiledeskChatbotClient(
  {
    request: req,
    APIKEY: '__APIKEY__',
    APIURL: APIURL
  });
  console.log("Sending back:", JSON.stringify(bot_answer));
  tdclient.sendMessage(bot_answer, () => {
    console.log("Message sent.");
    directivesPlug.processDirectives(() => {
      console.log("End processing directives.");
    })
  });
}

function getIntentByDisplayName(name, bot) {
  return new Promise(function(resolve, reject) {
    var query = { "id_project": bot.id_project, "id_faq_kb": bot._id, "intent_display_name": name};
    console.debug('query', query);
    Faq.find(query).lean().exec(function (err, faqs) {
      if (err) {
        return reject();
      }
      console.debug("faqs", faqs);
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


app.get('/', (req, res) => {
  res.send('Hello Tiledesk Widget app!');
});

var connection = mongoose.connect(process.env.mongoUrl, { "useNewUrlParser": true, "autoIndex": false }, function(err) {
  if (err) { 
    console.error('Failed to connect to MongoDB on ' + process.env.mongoUrl + " ", err);
    process.exit(1);
  }
});

app.listen(3000, () => {
  console.log('server started');
});
