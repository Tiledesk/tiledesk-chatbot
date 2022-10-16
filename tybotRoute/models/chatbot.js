let Faq = require('./models/faq');
let Faq_kb = require('./models/faq_kb');

class Chatbot {

  constructor() {
    
  }
  
  find(text, callback) {
    return new Promise( (resolve, reject) => {

      const bot = await Faq_kb.findById(botId).select('+secret').exec();
      if (log) {console.log("bot:", bot);}
      
      const locked_intent = await currentLockedIntent(message.request.request_id);
      if (log) {console.log("got locked intent", locked_intent)}
      if (locked_intent) {
        const tdclient = new TiledeskClient({
          projectId: message.id_project,
          token: token,
          APIURL: APIURL,
          APIKEY: "___",
          log: false
        });
        const faqs = await tdclient.getIntents(botId, locked_intent, 0, 0, null);
        if (log) {console.log("locked intent. got faqs", faqs)}
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
  }

  getIntentByDisplayName(name, bot) {
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

  function execFaq(faqs, botId, message, token, bot) {
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
      const intent_answer = message.text;
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
        return form_reply.message;
        /*apiext.sendSupportMessageExt(form_reply.message, projectId, requestId, token, () => {
          if (log) {console.log("FORM Message sent.", );}
        });
        return;*/
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

    return bot_answer;
    
    /*apiext.sendSupportMessageExt(bot_answer, projectId, requestId, token, () => {
      if (log) {console.log("Message sent");}
    });*/
    
  }
}

modeule.exports = { Chatbot };