// let Faq = require('./faq');
// let Faq_kb = require('./faq_kb');
// const { ExtApi } = require('../ExtApi.js');
const { MessagePipeline } = require('../tiledeskChatbotPlugs/MessagePipeline');
// const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { WebhookChatbotPlug } = require('../tiledeskChatbotPlugs/WebhookChatbotPlug');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { IntentForm } = require('./IntentForm.js');

class TiledeskChatbot {

  constructor(config) {
    if (!config.botsDataSource) {
      throw new Error("config.botsDataSource is mandatory");
    }
    if (!config.intentsFinder) {
      throw new Error("config.intentsFinder is mandatory");
    }
    if (!config.botId) {
      throw new Error("config.botId is mandatory");
    }
    this.botsDataSource = config.botsDataSource;
    this.intentsFinder = config.intentsFinder;
    this.botId = config.botId;
    this.token = config.token;
    this.tdcache = config.tdcache;
    this.APIURL = config.APIURL;
    this.APIKEY = config.APIKEY;
    this.requestId = config.requestId;
    this.projectId = config.projectId;
    this.log = config.log;
  }

  async replyToMessage(message, callback) {
    return new Promise( async (resolve, reject) => {
      // get bot info
      let bot;
      try {
        bot = await this.botsDataSource.getBotById(this.botId);
      }
      catch(error) {
        console.error("error", error);
        reject(error);
        return;
      }
      // Checking locked intent
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
        // it only gets the locked_intent
        const faq = await this.botsDataSource.getByIntentDisplayName(this.botId, locked_intent);
        if (this.log) {console.log("locked intent. got faqs", faq)}
        let reply;
        if (faq) {
          reply = await this.execIntent(faq, message, bot);
        }
        else {
          reply = {
            "text": "An error occurred while getting locked intent:'" + locked_intent
          }
        }
        resolve(reply);
        return;
      }

      // Explicit intent invocation
      if (message.text.startWith("/")) {
        let intent_name = message.substring(message.text.indexOf("/") + 1);
        if (!message.attributes) {
          message.attributes = {}
        }
        message.attributes.action = intent_name;        
      }
      
      // Checking Action button
      if (message.attributes && message.attributes.action) {
        let action = message.attributes.action;
        let action_parameters_index = action.indexOf("?");
        if (action_parameters_index > -1) {
            action = action.substring(0, action_parameters_index);
        }
        let faq = await this.botsDataSource.getByIntentDisplayName(this.botId, action);
        let reply;
        if (faq) {
          try {
            reply = await this.execIntent(faq, message, bot);
          }
          catch(error) {
            console.error("error");
            reject(error);
          }
        }
        else {
          reply = {
            "text": "An error occurred while getting intent by action:'" + action
          }
        }
        resolve(reply);
        return;
      }
      
      // let faqs = await this.botsDataSource.getByExactMatch(message.text);
      // let faq = await this.botsDataSource.getIntentByDisplayName(display_name);
      // let intents = await this.intentsFinder.find(message.text);
      // let intent = {
      //   "name": "intent_name"
      // }

      // SEARCH INTENTS
      let faqs;
      try {
        faqs = await this.botsDataSource.getByExactMatch(this.botId, message.text);
      }
      catch (error) {
        console.error("An error occurred during exact match:", error);
      }
      if (faqs && faqs.length > 0 && faqs[0].answer) {
        if (this.log) {console.log("EXACT MATCH OR ACTION FAQ:", faqs[0]);}
        let reply;
        try {
          reply = await this.execIntent(faqs[0], message, bot);
        }
        catch(error) {
          console.error("error during exact match execIntent():", error);
          reject(error);
          return;
        }
        resolve(reply);
        return;
      }
      else { // NLP
        if (this.log) {console.log("NLP decode intent...");}
        let intents;
        try {
          intents = await this.intentsFinder.decode(this.botId, message.text);
        }
        catch(error) {
          console.error("An error occurred:", error);
        }
        if (this.log) {console.log("NLP decoded found:", intents);}
        if (intents && intents.length > 0) {
          let faq = await this.botsDataSource.getByIntentDisplayName(this.botId, intents[0].intent_display_name);
          let reply;
          try {
            reply = await this.execIntent(faq, message, bot);
          }
          catch(error) {
            console.error("error during NLP decoding:", error);
            reject(error);
            return;
          }
          resolve(reply);
          return;
        }
        else {
          // fallback
          let fallbackIntent = await this.botsDataSource.getByIntentDisplayName(this.botId, "defaultFallback");
          if (!fallbackIntent) {
            resolve(null);
            return;
          }
          else {
            let reply;
            try {
              reply = await this.execIntent(fallbackIntent, message, bot);
            }
            catch(error) {
              console.error("error during defaultFallback:", error);
              reject(error);
              return;
            }
            resolve(reply);
            return;
          }
        }
      }
    });
  }

  async execIntent(faq, message, bot) {
    let answerObj = faq; // faqs[0];
    const botId = bot._id;
    let sender = 'bot_' + botId;
    //var answerObj;
    //answerObj.score = 100; // exact search has max score
  
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
    // let extEndpoint = `${this.APIURL}/modules/tilebot/`;
    // if (process.env.TYBOT_ENDPOINT) {
    //   extEndpoint = `${process.env.TYBOT_ENDPOINT}`;
    // }
    // const apiext = new ExtApi({
    //   ENDPOINT: extEndpoint,
    //   log: this.log
    // });
    // console.log("the form...")
    
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
    console.log("IntentForm.isValidForm(intent_form)", IntentForm.isValidForm(intent_form))
    if (intent_form && IntentForm.isValidForm(intent_form)) {
      await this.lockIntent(requestId, intent_name);
      const user_reply = message.text;
      //const intent_answer = answerObj.answer; //req.body.payload.text;
      let form_reply = await this.execIntentForm(user_reply, intent_form);
      console.log("got form reply", form_reply)
      //if (form_reply_message) {
      if (!form_reply.canceled && form_reply.message) {
        console.log("Form replying for next field...");
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
        // console.log("Form end.");
        if (this.log) {console.log("unlocking intent for request", requestId);}
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

    // console.log("the static_bot_answer...")
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
    // let clonedfaqs = faqs.slice();
    // if (clonedfaqs && clonedfaqs.length > 0) {
    //     clonedfaqs = clonedfaqs.shift()
    // }
    const intent_info = {
        intent_name: answerObj.intent_display_name,
        is_fallback: false,
        confidence: answerObj.score,
        question_payload: question_payload,
        // others: clonedfaqs
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
    // console.log("returning answer", bot_answer)
    return bot_answer;
    
    /*apiext.sendSupportMessageExt(bot_answer, projectId, requestId, token, () => {
      if (log) {console.log("Message sent");}
    });*/
    
  }

  async lockIntent(requestId, intent_name) {
    await this.tdcache.set("tilebot:requests:"  + requestId + ":locked", intent_name);
  }
  
  async currentLockedIntent(requestId) {
    if (this.tdcache) {
      return await this.tdcache.get("tilebot:requests:"  + requestId + ":locked");
    }
    else {
      return null;
    }
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