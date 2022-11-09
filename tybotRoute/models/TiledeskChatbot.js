let Faq = require('./faq');
let Faq_kb = require('./faq_kb');
const { ExtApi } = require('../ExtApi.js');
const { MessagePipeline } = require('../tiledeskChatbotPlugs/MessagePipeline');
const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { WebhookChatbotPlug } = require('../tiledeskChatbotPlugs/WebhookChatbotPlug');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { IntentForm } = require('./IntentForm.js');

class TiledeskChatbot {

  constructor(config) {
    this.botId = config.botId;
    this.token = config.token;
    this.faq_kb = config.faq_kb;
    this.tdcache = config.tdcache;
    this.APIURL = config.APIURL;
    this.APIKEY = config.APIKEY;
    this.requestId = config.requestId;
    this.projectId = config.projectId;
    this.log = config.log;
  }
  
  async replyToMessage(message, callback) {
    return new Promise( async (resolve, reject) => {

      const bot = await Faq_kb.findById(this.botId).select('+secret').exec();
      if (this.log) {console.log("bot:", bot);}
      
      const locked_intent = await this.currentLockedIntent(this.requestId);
      if (this.log) {console.log("got locked intent", locked_intent)}
      if (locked_intent) {
        const tdclient = new TiledeskClient({
          projectId: message.id_project,
          token: this.token,
          APIURL: this.APIURL,
          APIKEY: this.APIKEY,
          log: false
        });
        const faqs = await tdclient.getIntents(this.botId, locked_intent, 0, 0, null);
        if (this.log) {console.log("locked intent. got faqs", faqs)}
        let reply = await this.execIntent(faqs, this.botId, message, bot);
        resolve(reply);
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
      let query = { "id_project": this.projectId, "id_faq_kb": this.botId, "question": message.text };
      // BUT CHECKING ACTION BUTTON...
      if (message.attributes && message.attributes.action) {
        var action = message.attributes.action;
        var action_parameters_index = action.indexOf("?");
        if (action_parameters_index > -1) {
            action = action.substring(0, action_parameters_index);
        }
        query = { "id_project": this.projectId, "id_faq_kb": botId, "intent_display_name": action };
      }
      
      // SEARCH INTENTS
      Faq.find(query).lean().exec(async (err, faqs) => {
        if (err) {
          return console.error("Error getting faq object.", err);
        }
        if (faqs && faqs.length > 0 && faqs[0].answer) {
          if (this.log) {console.log("EXACT MATCH OR ACTION FAQ:", faqs[0]);}
          let reply = await this.execIntent(faqs, this.botId, message, bot);
          resolve(reply);
          //resolve(this.execIntent(faqs, this.botId, message, bot)); // bot_token
        }
        else { // FULL TEXT
          if (this.log) {console.log("NLP decode intent...");}
          query = { "id_project": this.projectId, "id_faq_kb": this.botId };
          var mongoproject = undefined;
          var sort = undefined;
          var search_obj = { "$search": message.text };
    
          if (this.faq_kb.language) {
              search_obj["$language"] = this.faq_kb.language;
          }
          query.$text = search_obj;
          //console.debug("fulltext search query", query);
    
          mongoproject = { score: { $meta: "textScore" } };
          sort = { score: { $meta: "textScore" } } 
          // DA QUI RECUPERO LA RISPOSTA DATO (ID: SE EXT_AI) (QUERY FULLTEXT SE NATIVE-BASIC-AI)
          Faq.find(query, mongoproject).sort(sort).lean().exec(async (err, faqs) => {
            if (this.log) {console.log("Found:", faqs);}
            if (err) {
              console.error("Error:", err);
            }
            if (faqs && faqs.length > 0 && faqs[0].answer) {
              let reply = await this.execIntent(faqs, this.botId, message, bot);
              resolve(reply);
            }
            else {
              // fallback
              const fallbackIntent = await this.getIntentByDisplayName("defaultFallback", bot);
              const faqs = [fallbackIntent];
              let reply = await this.execIntent(faqs, this.botId, message, bot);
              resolve(reply); // bot_token
            }
          });
        }
      });
    });
  }

  getIntentByDisplayName(name, bot) {
    return new Promise((resolve, reject) => {
      var query = { "id_project": bot.id_project, "id_faq_kb": bot._id, "intent_display_name": name};
      if (this.log) {console.debug('query', query);}
      Faq.find(query).lean().exec( (err, faqs) => {
        if (err) {
          return reject(err);
        }
        if (this.log) {console.debug("faqs", faqs);}
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

  async execIntent(faqs, botId, message, bot) {
    answerObj = faqs[0];
    let sender = 'bot_' + botId;
    var answerObj;
    answerObj.score = 100; //exact search not set score
  
    const requestId = message.request.request_id;
    const projectId = message.id_project;
    if (this.log) {
      console.log("requestId:", requestId)
      console.log("token:", this.token)
      console.log("projectId:", projectId)
    }
    
    if (this.tdcache) {
      const requestKey = "tilebot:" + requestId
      // best effort, do not "await", go on, trust redis speed.
      this.tdcache.setJSON(requestKey, message.request);
    }
    // /ext/:projectId/requests/:requestId/messages ENDPOINT COINCIDES
    // with API_ENDPOINT (APIRURL) ONLY WHEN THE TYBOT ROUTE IS HOSTED
    // ON THE MAIN SERVER. OTHERWISE WE USE TYBOT_ROUTE TO SPECIFY
    // THE ALTERNATIVE ROUTE.
    let extEndpoint = `${this.APIURL}/modules/tilebot/`;
    if (process.env.TYBOT_ENDPOINT) {
      extEndpoint = `${process.env.TYBOT_ENDPOINT}`;
    }
    const apiext = new ExtApi({
      ENDPOINT: extEndpoint,
      log: this.log
    });
    //console.log("the form...")
    
    // THE FORM
    
    let intent_name = answerObj.intent_display_name
  // THE FORM
    if (intent_name === "test_form_intent") {
      answerObj.form = {
        "cancelCommands": ['annulla', 'cancella', 'reset', 'cancel'],
        "cancelReply": "Ok annullato!",
        "fields": [
          {
            "name": "userFullname",
            "type": "text",
            "label": "What is your name?\n* Andrea\n* Marco\n* Mirco\n* Luca Leo"
          },{
            "name": "companyName",
            "type": "text",
            "label": "Thank you ${userFullname}! What is your Company name?\n* Tiledesk\n* Frontiere21"
          },
          {
            "name": "userEmail",
            "type": "text",
            "regex": "/^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/",
            "label": "Hi ${userFullname} from ${companyName}\n\nJust one last question\n\nYour email 🙂\n* andrea@libero.it\n* andrea@tiledesk.com",
            "errorLabel": "${userFullname} this email address is invalid\n\nCan you insert a correct email address?"
          }
        ]
      };
    }
    let intent_form = answerObj.form;
    if (intent_form) {
      await this.lockIntent(requestId, intent_name);
      const user_reply = message.text;
      //const intent_answer = answerObj.answer; //req.body.payload.text;
      let form_reply = await this.execIntentForm(user_reply, intent_form);
      //console.log("got form reply", form_reply)
      //if (form_reply_message) {
      if (!form_reply.canceled && form_reply.message) {
        //console.log("Form replying for next field...");
        if (this.log) {console.log("Sending form reply...", form_reply.message)}
        // reply with this message (ex. please enter your fullname)
        if (!form_reply.message.attributes) {
          form_reply.message.attributes = {}
        }
        form_reply.message.attributes.fillParams = true;
        form_reply.message.attributes.splits = true;
        form_reply.message.attributes.markbot = true;
        return form_reply.message;
        //apiext.sendSupportMessageExt(form_reply.message, projectId, requestId, token, () => {
        //  if (log) {console.log("FORM Message sent.", );}
        //});
        //return;
      }
      else if (form_reply.end) {
        //console.log("Form end.");
        if (this.log) {
          console.log("Form end.");
          console.log("Unlocking intent for request", requestId);
        }
        this.unlockIntent(requestId);
        this.populatePrechatFormAndLead(message);
      }
      else if (form_reply.canceled) {
        console.log("Form canceled.");
        if (this.log) {console.log("unlocking intent due to canceling, for request", requestId);}
        this.unlockIntent(requestId);
        if (this.log) {console.log("sending form 'cancel' reply...", form_reply.message)}
        // reply with this message (ex. please enter your fullname)
        if (!form_reply.message.attributes) {
          form_reply.message.attributes = {}
        }
        form_reply.message.attributes.fillParams = true;
        form_reply.message.attributes.splits = true;
        return form_reply.message
        //apiext.sendSupportMessageExt(form_reply.message, projectId, requestId, token, () => {
        //  if (log) {console.log("FORM Message sent.", );}
        //});
        //return;
      }
      //console.log("form_reply is", form_reply)
    }
  
    // FORM END
    
    const context = {
      payload: {
        botId: botId,
        bot: bot,
        message: message, // USER MESSAGE (JSON)
        intent: answerObj
      },
      token: this.token
    };

    //console.log("the static_bot_answer...")
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
    const bot_answer = await this.execPipeline(static_bot_answer, message, bot, context, this.token);
    
    //bot_answer.text = await fillWithRequestParams(bot_answer.text, requestId); // move to "ext" pipeline
    return bot_answer;
    
    /*apiext.sendSupportMessageExt(bot_answer, projectId, requestId, token, () => {
      if (log) {console.log("Message sent");}
    });*/
    
  }

  async lockIntent(requestId, intent_name) {
    await this.tdcache.set("tilebot:requests:"  + requestId + ":locked", intent_name);
  }
  
  async currentLockedIntent(requestId) {
    return await this.tdcache.get("tilebot:requests:"  + requestId + ":locked");
  }
  
  async unlockIntent(requestId) {
    await this.tdcache.del("tilebot:requests:"  + requestId + ":locked");
  }

  async addParameter(requestId, parameter_name, parameter_value) {
    //await this.tdcache.hset("tilebot:requests:" + requestId + ":parameters", parameter_name, parameter_value);
    await TiledeskChatbot.addParameterStatic(this.tdcache, requestId, parameter_name, parameter_value);
  }

  static async addParameterStatic(_tdcache, requestId, parameter_name, parameter_value) {
    await _tdcache.hset("tilebot:requests:" + requestId + ":parameters", parameter_name, parameter_value);
  }

  async allParameters(requestId) {
    //const parameters_key = "tilebot:requests:" + requestId + ":parameters";
    //return await this.tdcache.hgetall(parameters_key);
    return await TiledeskChatbot.allParametersStatic(this.tdcache, requestId);
  }

  static async allParametersStatic(_tdcache, requestId) {
    const parameters_key = "tilebot:requests:" + requestId + ":parameters";
    return await _tdcache.hgetall(parameters_key);
  }
  
  async execPipeline(static_bot_answer, message, bot, context) {
    const messagePipeline = new MessagePipeline(static_bot_answer, context);
    const webhookurl = bot.webhook_url;
    messagePipeline.addPlug(new WebhookChatbotPlug(message.request, webhookurl, this.token));
    //messagePipeline.addPlug(directivesPlug);
    //messagePipeline.addPlug(new SplitsChatbotPlug(log));
    //messagePipeline.addPlug(new MarkbotChatbotPlug(log));
    const bot_answer = await messagePipeline.exec();
    //if (log) {console.log("End pipeline, bot_answer:", JSON.stringify(bot_answer));}
    return bot_answer;
  }

  async execIntentForm(userInputReply, form) {
  if (this.log)   {console.log("executing intent form...")}
    let intentForm = new IntentForm({form: form, requestId: this.requestId, chatbot: this, log: this.log});
    let message = await intentForm.getMessage(userInputReply);
    return message;
  }

  async populatePrechatFormAndLead(message, callback) {
    const tdclient = new TiledeskClient({
      projectId: this.projectId,
      token: this.token,
      APIURL: this.APIURL,
      APIKEY: this.APIKEY
    });
    
    const leadId = message.request.lead._id;
    const requestId = message.request.request_id;
  
    const parameters_key = "tilebot:requests:" + requestId + ":parameters";
    const all_parameters = await this.tdcache.hgetall(parameters_key);
    if (all_parameters) {
      //console.log("all_parameters['userEmail']", all_parameters['userEmail'])
      //console.log("all_parameters['userFullname']", all_parameters['userFullname']); 
      tdclient.updateLeadEmailFullname(leadId, null, all_parameters['userFullname'], () => {
        if (this.log) {console.log("lead updated.")}
        tdclient.updateRequestAttributes(requestId, {
          preChatForm: all_parameters,
          updated: Date.now
        }, () => {
          if (this.log) {console.log("prechat updated.");}
          if (callback) {
            callback();
          }
        });
      });
    };
  }
    
}

module.exports = { TiledeskChatbot };