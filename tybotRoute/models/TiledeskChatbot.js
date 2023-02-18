// let Faq = require('./faq');
// let Faq_kb = require('./faq_kb');
// const { ExtApi } = require('../ExtApi.js');
const { MessagePipeline } = require('../tiledeskChatbotPlugs/MessagePipeline');
// const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { WebhookChatbotPlug } = require('../tiledeskChatbotPlugs/WebhookChatbotPlug');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { IntentForm } = require('./IntentForm.js');
const { TiledeskChatbotUtil } = require('./TiledeskChatbotUtil.js');
const { DirLockIntent } = require('../tiledeskChatbotPlugs/directives/DirLockIntent');
const { DirUnlockIntent } = require('../tiledeskChatbotPlugs/directives/DirUnlockIntent');

class TiledeskChatbot {

  static MAX_STEPS = 20;

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
    if (!config.bot) {
      throw new Error("config.bot is mandatory");
    }
    this.botsDataSource = config.botsDataSource;
    this.intentsFinder = config.intentsFinder;
    this.botId = config.botId;
    this.bot = config.bot;
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
      // if (this.log) {
      //   console.log("replyToMessage():", JSON.stringify(message));
      // }
      let lead = null;
      if (message.request) {
        this.request = message.request;
        lead = message.request.lead;
        if (lead && lead.fullname) {
          if (this.log) {console.log("lead.fullname => params.userFullname:", lead.fullname)}
          await this.addParameter(this.requestId, "userFullname", lead.fullname);
        }
        if (lead && lead.email) {
          if (this.log) {console.log("lead.email => params.userEmail:", lead.email)}
          await this.addParameter(this.requestId, "userEmail", lead.email);
        }
      }
      if (this.log) {
        console.log("replyToMessage() > lead found:", JSON.stringify(lead));
      }
      
      // any external invocation restarts the steps counter
      if (message.sender != "_tdinternal") {
        if (this.log) {
          console.log("Resetting current step by request message:", message.text);
        }
        await TiledeskChatbot.resetStep(this.tdcache, this.requestId);
        if (this.log) {
          if (this.tdcache) {
            let currentStep = 
            await TiledeskChatbot.currentStep(this.tdcache, this.requestId);
            if (this.log) {console.log("after reset currentStep:", currentStep)}
          }
        }
      }
      // Emergency stop :)
      // if (message.text === "/anomaly") {
      //   console.log(".................stop on /anomaly!");
      //   resolve(null);
      // }

      // Checking locked intent (for non-internal intents)
      // internal intents always "skip" the locked intent
      // if (message.text.startsWith("/") && message.sender != "_tdinternal") {
        const locked_intent = await this.currentLockedIntent(this.requestId);
        if (this.log) {console.log("got locked intent", locked_intent)}
        if (locked_intent) {
          const tdclient = new TiledeskClient({
            projectId: this.projectId,
            token: this.token,
            APIURL: this.APIURL,
            APIKEY: this.APIKEY,
            log: false
          });
          // it only gets the locked_intent
          // const faq = await this.botsDataSource.getByIntentDisplayName(this.botId, locked_intent);
          const faq = await this.botsDataSource.getByIntentDisplayNameCache(this.botId, locked_intent, this.tdcache);
          if (this.log) {console.log("locked intent. got faqs", JSON.stringify(faq))}
          let reply;
          if (faq) {
            reply = await this.execIntent(faq, message, lead);//, bot);
          }
          else {
            reply = {
              "text": "An error occurred while getting locked intent:'" + locked_intent
            }
          }
          resolve(reply);
          return;
        }
      // }
      // else if (message.text.startsWith("/")) {
      //   if (this.log) {
      //     console.log("Internal intent". message.text, "skips locked intent check");
      //   }
      // }

      let explicit_intent_name = null;
      // Explicit intent invocation
      if (message.text.startsWith("/")) {
        if (this.log) {console.log("Intent was explicitly invoked:", message.text);}
        let intent_name = message.text.substring(message.text.indexOf("/") + 1);
        if (this.log) {console.log("Invoked Intent:", intent_name);}
        explicit_intent_name = intent_name;
        // if (!message.attributes) {
        //   message.attributes = {}
        // }
        // message.attributes.action = intent_name;
        // if (this.log) {console.log("Message action:", message.attributes.action)}
      }
      
      // Intent invocation with action
      if (message.attributes && message.attributes.action) {
        if (this.log) {console.log("Message has action:", message.attributes.action)}
        explicit_intent_name = message.attributes.action;
        /*let action_parameters_index = action.indexOf("?");
        if (action_parameters_index > -1) {
            intent_name = intent_name.substring(0, action_parameters_index);
        }*/
        if (this.log) {console.log("Intent was explicitly invoked with an action:", explicit_intent_name);}
      }

      if (explicit_intent_name) {
        if (this.log) {console.log("Processing explicit intent:", explicit_intent_name)}
        // look for parameters
        const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
        if (this.log) {console.log("parsed intent:", intent);}
        let reply;
        if (!intent || (intent && !intent.name)) {
          if (this.log) {console.log("Invalid intent:", explicit_intent_name);}
          reply = {
            "text": "Invalid intent: *" + explicit_intent_name + "*"
          }
        }
        else {
          if (this.log) {console.log("processing intent:", explicit_intent_name);}
          // let faq = await this.botsDataSource.getByIntentDisplayName(this.botId, intent.name);
          if (this.log) {
            console.log("intent this.botId:", this.botId);
            console.log("intent intent.name:", intent.name);
            if (this.tdcache) {
              console.log("intent this.tdcache ok");
            }
            else {
              console.log("no intent this.tdcache");
            }
          }
          let faq = await this.botsDataSource.getByIntentDisplayNameCache(this.botId, intent.name, this.tdcache);
          if (faq) {
            if (this.log) {
              console.log("Got a reply (faq) by Intent name:", JSON.stringify(faq));}
            try {
              if (intent.parameters) {
                for (const [key, value] of Object.entries(intent.parameters)) {
                  if (this.log) {console.log(`Adding parameter from intent => ${key}: ${value}`);}
                  this.addParameter(key, value);
                }
              }
              reply = await this.execIntent(faq, message, lead);
            }
            catch(error) {
              console.error("error");
              reject(error);
            }
          }
          else {
            if (this.log) {console.log("Intent not found:", explicit_intent_name);}
            reply = {
              "text": "Intent not found: " + explicit_intent_name
            }
          }
        }
        resolve(reply);
        return;
      }

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
          reply = await this.execIntent(faqs[0], message, lead);//, bot);
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
        if (this.log) {console.log("Chatbot NLP decode intent...");}
        let intents;
        try {
          intents = await this.intentsFinder.decode(this.botId, message.text);
        }
        catch(error) {
          console.error("An error occurred:", error);
        }
        if (this.log) {console.log("NLP decoded found:", intents);}
        if (intents && intents.length > 0) {
          // let faq = await this.botsDataSource.getByIntentDisplayName(this.botId, intents[0].intent_display_name);
          let faq = await this.botsDataSource.getByIntentDisplayNameCache(this.botId, intents[0].intent_display_name, this.tdcache);
          let reply;
          try {
            reply = await this.execIntent(faq, message, lead);//, bot);
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
          // let fallbackIntent = await this.botsDataSource.getByIntentDisplayName(this.botId, "defaultFallback");
          let fallbackIntent = await this.botsDataSource.getByIntentDisplayNameCache(this.botId, "defaultFallback", this.tdcache);
          if (!fallbackIntent) {
            // console.log("No defaultFallback found!");
            resolve(null);
            return;
          }
          else {
            let reply;
            try {
              reply = await this.execIntent(fallbackIntent, message, lead);//, bot);
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
  
  async execIntent(faq, message, lead) {//, bot) {
    let answerObj = faq; // faqs[0];
    const botId = this.botId;
    // let sender = 'bot_' + botId;
    //var answerObj;
    //answerObj.score = 100; // exact search has max score
    if (this.log) {
      console.log("requestId:", this.requestId)
      console.log("token:", this.token)
      console.log("projectId:", this.projectId)
    }
    if (this.tdcache) {
      const requestKey = "tilebot:" + this.requestId
      await this.tdcache.setJSON(requestKey, this.request);
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
    
    let intent_name = answerObj.intent_display_name
    // THE FORM
    // if (intent_name === "test_form_intent") {
    //   answerObj.form = {
    //     "cancelCommands": ['reset', 'cancel'],
    //     "cancelReply": "Ok canceled!",
    //     "fields": [
    //       {
    //         "name": "userFullname",
    //         "type": "text",
    //         "label": "What is your name?\n* Andrea\n* Marco\n* Mirco\n* Luca Leo"
    //       },{
    //         "name": "companyName",
    //         "type": "text",
    //         "label": "Thank you ${userFullname}! What is your Company name?\n* Tiledesk\n* Frontiere21"
    //       },
    //       {
    //         "name": "userEmail",
    //         "type": "text",
    //         "regex": "/^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/",
    //         "label": "Hi ${userFullname} from ${companyName}\n\nJust one last question\n\nYour email 🙂\n* andrea@libero.it\n* andrea@tiledesk.com",
    //         "errorLabel": "${userFullname} this email address is invalid\n\nCan you insert a correct email address?"
    //       }
    //     ]
    //   };
    // }
    let intent_form = answerObj.form;
    if (this.log) {
      console.log("IntentForm.isValidForm(intent_form)", IntentForm.isValidForm(intent_form));
    }
    let clientUpdateUserFullname = null;
    if (IntentForm.isValidForm(intent_form)) {
      await this.lockIntent(this.requestId, intent_name);
      const user_reply = message.text;
      let form_reply = await this.execIntentForm(user_reply, intent_form);
      // console.log("got form reply", form_reply)
      if (!form_reply.canceled && form_reply.message) {
        // console.log("Form replying for next field...");
        if (this.log) {console.log("Sending form reply...", form_reply.message)}
        // reply with this message (ex. please enter your fullname)
        if (!form_reply.message.attributes) {
          form_reply.message.attributes = {}
        }
        form_reply.message.attributes.fillParams = true;
        form_reply.message.attributes.splits = true;
        form_reply.message.attributes.markbot = true;
        return form_reply.message;
      }
      else if (form_reply.end) {
        if (this.log) {
          console.log("FORM end.", );
          console.log("unlocking intent for request:", this.requestId);
          console.log("populate data on lead:", JSON.stringify(lead));
        }
        this.unlockIntent(this.requestId);
        if (lead) {
          this.populatePrechatFormAndLead(lead._id, this.requestId);
        }
        else {
          if (this.log) {console.log("No lead. Skipping populatePrechatFormAndLead()");}
        }
        const all_parameters = await this.allParameters();
        // if (this.log) {console.log("We have all_parameters:", all_parameters)};
        if (all_parameters && all_parameters["userFullname"]) {
          clientUpdateUserFullname = all_parameters["userFullname"];
        }
      }
      else if (form_reply.canceled) {
        console.log("Form canceled.");
        if (this.log) {console.log("unlocking intent due to canceling, for request", this.requestId);}
        this.unlockIntent(this.requestId);
        if (this.log) {console.log("sending form 'cancel' reply...", form_reply.message)}
        // reply with this message (ex. please enter your fullname)
        if (!form_reply.message.attributes) {
          form_reply.message.attributes = {}
        }
        form_reply.message.attributes.fillParams = true;
        form_reply.message.attributes.splits = true;
        form_reply.message.attributes.directives = true;
        return form_reply.message
      }
    }
    // FORM END
    
    const context = {
      payload: {
        botId: botId,
        bot: this.bot,
        message: message, // USER MESSAGE (JSON)
        intent: answerObj
      },
      token: this.token
    };
    
    let static_bot_answer;
    if (answerObj.actions && answerObj.actions.length > 0) {
      static_bot_answer = { // actions workflow will be executed
        actions: answerObj.actions
      }
    }
    else if (answerObj.answer) {
      static_bot_answer = { // static design of the chatbot reply
        //type: answerObj.type,
        text: answerObj.answer,
        // attributes: answerObj.attributes,
        // metadata: answerObj.metadata,
        // language: ?
        // channel: ? whatsapp|telegram|facebook...
      };
    }
    else {
      console.error("Intent with no actions or answer.", JSON.stringify(answerObj) );
      return null;
    }
    
    // TODO Should be included in each "message" in actions.
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
    const intent_info = {
      intent_name: answerObj.intent_display_name,
      is_fallback: false,
      confidence: answerObj.score,
      question_payload: question_payload,
      botId: this.botId,
      bot: this.bot
    }
    static_bot_answer.attributes.intent_info = intent_info;
    // static_bot_answer.attributes.directives = true;
    // static_bot_answer.attributes.splits = true;
    // static_bot_answer.attributes.markbot = true;
    // static_bot_answer.attributes.fillParams = true;
    static_bot_answer.attributes.webhook = answerObj.webhook_enabled;

    if (clientUpdateUserFullname) {
      if (this.log) {console.log("We must clientUpdateUserFullname with:", clientUpdateUserFullname)};
      static_bot_answer.attributes.updateUserFullname = clientUpdateUserFullname;
    }
    // exec webhook
    const bot_answer = await this.execWebhook(static_bot_answer, message, this.bot, context, this.token);
    if (this.log) {console.log("bot_answer ready:", JSON.stringify(bot_answer));}
    return bot_answer;
  }

  async lockIntent(requestId, intent_name) {
    // await this.tdcache.set("tilebot:requests:"  + requestId + ":locked", intent_name);
    await DirLockIntent.lockIntent(this.tdcache, requestId, intent_name);
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
    await DirUnlockIntent.unlockIntent(this.tdcache, requestId);
    // await this.tdcache.del("tilebot:requests:"  + requestId + ":locked");
  }

  async addParameter(parameter_name, parameter_value) {
    //await this.tdcache.hset("tilebot:requests:" + requestId + ":parameters", parameter_name, parameter_value);
    await TiledeskChatbot.addParameterStatic(this.tdcache, this.requestId, parameter_name, parameter_value);
  }

  async deleteParameter(parameter_name) {
    //await this.tdcache.hset("tilebot:requests:" + requestId + ":parameters", parameter_name, parameter_value);
    await TiledeskChatbot.deleteParameterStatic(this.tdcache, this.requestId, parameter_name);
  }

  static async addParameterStatic(_tdcache, requestId, parameter_name, parameter_value) {
    // const parameter_key = "tilebot:requests:" + requestId + ":parameters";
    const parameter_key = TiledeskChatbot.requestCacheKey(requestId) + ":parameters";
    await _tdcache.hset(parameter_key, parameter_name, parameter_value);
  }

  static async checkStep(_tdcache, requestId, max_steps) {
    // console.log("CHECKING ON MAX_STEPS:", max_steps);
    let go_on = true; // continue
    const parameter_key = TiledeskChatbot.requestCacheKey(requestId) + ":step";
    // console.log("__parameter_key:", parameter_key);
    await _tdcache.incr(parameter_key);
    // console.log("incr-ed");
    let _current_step = await _tdcache.get(parameter_key);
    // if (!_current_step) { // this shouldn't be happening
    //   _current_step = 0;
    // }
    let current_step = Number(_current_step);
    // current_step += 1;
    // await _tdcache.set(parameter_key, current_step); // increment step
    // console.log("CURRENT-STEP:", current_step);
    if (current_step > max_steps) { // max_steps limit just violated
      // console.log("CURRENT-STEP > MAX_STEPS!", current_step);
      // await TiledeskChatbot.resetStep(_tdcache, requestId);
      // go_on = 1; // stop execution, send error message
      go_on = false
    }
    // else if (current_step > max_steps + 1) { // max_steps limit already violated
    //   console.log("CURRENT-STEP > MAX_STEPS!", current_step);
    //   // await TiledeskChatbot.resetStep(_tdcache, requestId);
    //   go_on = 2; // stop execution, don't send error message (already sent with go_on = 1)
    // }
    else {
      // go_on = 0;
      go_on = true;
    }
    // else {
      // console.log("CURRENT-STEP UNDER MAX_STEPS THRESHOLD:)", current_step);
      // current_step += 1;
      // await _tdcache.set(parameter_key, current_step); // increment step
      // console.log("current_step from cache:", await _tdcache.get(parameter_key));
    // }
    return go_on;
  }

  static async resetStep(_tdcache, requestId) {
    const parameter_key = TiledeskChatbot.requestCacheKey(requestId) + ":step";
    // console.log("resetStep() parameter_key:", parameter_key);
    if (_tdcache) {
      await _tdcache.set(parameter_key, 0);
    }
  }

  static async currentStep(_tdcache, requestId) {
    const parameter_key = TiledeskChatbot.requestCacheKey(requestId) + ":step";
    // console.log("currentStep() parameter_key:", parameter_key);
    return await _tdcache.get(parameter_key);
  }

  async allParameters() {
    return await TiledeskChatbot.allParametersStatic(this.tdcache, this.requestId);
  }

  static async allParametersStatic(_tdcache, requestId) {
    // const parameters_key = "tilebot:requests:" + requestId + ":parameters";
    return await _tdcache.hgetall(
      TiledeskChatbot.requestCacheKey(requestId) + ":parameters");
  }

  static async getParameterStatic(_tdcache, requestId, key) {
    // const parameters_key = "tilebot:requests:" + requestId + ":parameters";
    return await _tdcache.hget(
      TiledeskChatbot.requestCacheKey(requestId) + ":parameters", key);
  }

  static async deleteParameterStatic(_tdcache, requestId, paramName) {
    return await _tdcache.hdel(
      TiledeskChatbot.requestCacheKey(requestId) + ":parameters", paramName);
  }

  static requestCacheKey(requestId) {
    const request_key = "tilebot:requests:" + requestId;
    return request_key;
  }
  
  async execWebhook(static_bot_answer, userMessage, bot, context) {
    if (this.log) {console.log("static_bot_answer.attributes.webhook:", static_bot_answer.attributes.webhook);}
    if (static_bot_answer.attributes && static_bot_answer.attributes.webhook && static_bot_answer.attributes.webhook === true) {
      const variables = await this.allParameters();
      context.variables = variables;
      if (this.log) {console.log("adding variables to webhook context:", context.variables);}
    }
    const messagePipeline = new MessagePipeline(static_bot_answer, context);
    const webhookurl = bot.webhook_url;
    messagePipeline.addPlug(new WebhookChatbotPlug(userMessage.request, webhookurl, this.token, this.log));
    //messagePipeline.addPlug(directivesPlug);
    //messagePipeline.addPlug(new SplitsChatbotPlug(log));
    //messagePipeline.addPlug(new MarkbotChatbotPlug(log));
    const bot_answer = await messagePipeline.exec();
    //if (log) {console.log("End pipeline, bot_answer:", JSON.stringify(bot_answer));}
    return bot_answer;
  }

  async execIntentForm(userInputReply, form) {
    if (this.log) {console.log("executing intent form...")}
    let all_parameters = await this.allParameters();
    // if (this.log) {console.log("allParameters for IntentForm:", all_parameters)}
    let intentForm = new IntentForm(
      {
        form: form,
        requestId: this.requestId,
        chatbot: this,
        requestParameters: all_parameters,
        log: this.log
      });
    let message = await intentForm.getMessage(userInputReply);
    return message;
  }

  async populatePrechatFormAndLead(leadId, requestId) {
    if (this.log) {console.log("(populatePrechatFormAndLead) leadId:", leadId);}
    if (this.log) {console.log("(populatePrechatFormAndLead) requestId:", requestId);}
    if (!leadId && !requestId) {
      if (this.log) {console.log("(populatePrechatFormAndLead) !leadId && !requestId");}
      return;
    }
    const tdclient = new TiledeskClient({
      projectId: this.projectId,
      token: this.token,
      APIURL: this.APIURL,
      APIKEY: this.APIKEY,
      log: this.log
    });
    // const parameters_key = "tilebot:requests:" + requestId + ":parameters";
    const all_parameters = await this.allParameters();//this.tdcache.hgetall(parameters_key);
    if (this.log) {console.log("(populatePrechatFormAndLead) parameters_key:", all_parameters);}
    if (all_parameters) {
      if (this.log) {console.log("(populatePrechatFormAndLead) userEmail:", all_parameters['userEmail']);}
      if (this.log) {console.log("(populatePrechatFormAndLead) userFullname:", all_parameters['userFullname']);}
      tdclient.updateLeadData(leadId, all_parameters['userEmail'], all_parameters['userFullname'], null, () => {
        if (this.log) {console.log("Lead updated.")}
        tdclient.updateRequestAttributes(requestId, {
          preChatForm: all_parameters,
          updated: Date.now
        }, () => {
          if (this.log) {console.log("Prechat updated.");}
        });
      });
    };
  }
    
}

module.exports = { TiledeskChatbot };