// let Faq = require('./faq');
// let Faq_kb = require('./faq_kb');
// const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { MessagePipeline } = require('../tiledeskChatbotPlugs/MessagePipeline');
const { WebhookChatbotPlug } = require('../tiledeskChatbotPlugs/WebhookChatbotPlug');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { IntentForm } = require('./IntentForm.js');
const { TiledeskChatbotUtil } = require('./TiledeskChatbotUtil.js');
const { DirLockIntent } = require('../tiledeskChatbotPlugs/directives/DirLockIntent');
const { DirUnlockIntent } = require('../tiledeskChatbotPlugs/directives/DirUnlockIntent');
const winston = require('../utils/winston');

class TiledeskChatbot {

  // static MAX_STEPS = process.env.CHATBOT_MAX_STEPS || 1000; // prod 1000;
  // static MAX_EXECUTION_TIME = process.env.CHATBOT_MAX_EXECUTION_TIME || 1000 * 3600 * 8;// test // prod1000 * 3600 * 4; // 4 hours

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
    this.backupIntentsFinder = config.backupIntentsFinder;
    this.botId = config.botId;
    this.bot = config.bot;
    this.token = config.token;
    this.tdcache = config.tdcache;
    this.APIURL = config.APIURL;
    this.APIKEY = config.APIKEY;
    this.requestId = config.requestId;
    this.projectId = config.projectId;
    this.MAX_STEPS = config.MAX_STEPS;
    this.MAX_EXECUTION_TIME = config.MAX_EXECUTION_TIME;
    this.log = config.log;
  }

  async replyToMessage(message, callback) {
    return new Promise( async (resolve, reject) => {
      let lead = null;
      if (message.request) {
        this.request = message.request;
      }
      
      // reset lockedIntent on direct user invocation ( /intent or action => this only?)
      if (message.sender != "_tdinternal") {
        try {
          winston.verbose("(TiledeskChatbot) Checking locked intent reset on action invocation")
          if (message.attributes && message.attributes.action) {
            winston.debug("(TiledeskChatbot) Message has action: " + message.attributes.action)
            await this.unlockIntent(this.requestId);
            await this.unlockAction(this.requestId);
            winston.debug("(TiledeskChatbot) Reset locked intent. Intent was explicitly invoked with an action: " + message.attributes.action)
          }
        } catch(error) {
          winston.error("(TiledeskChatbot) Error resetting locked intent: ", error)
        }
      }

      // any external invocation restarts the steps counter
      try {
        if (message.sender != "_tdinternal") {
          winston.verbose("(TiledeskChatbot) Resetting current step by request message: " + message.text);
          await TiledeskChatbot.resetStep(this.tdcache, this.requestId);
          await TiledeskChatbot.resetStarted(this.tdcache, this.requestId);
          if (this.log) {
            if (this.tdcache) {
              let currentStep = 
              await TiledeskChatbot.currentStep(this.tdcache, this.requestId);
              winston.verbose("(TiledeskChatbot) After reset currentStep:" + currentStep);
            }
          }
        }
      } catch(error) {
        winston.error("(TiledeskChatbot) Error resetting locked intent: ", error);
      }

      // Checking locked intent (for non-internal intents)
      // internal intents always "skip" the locked intent
      const locked_intent = await this.currentLockedIntent(this.requestId);
      winston.verbose("(TiledeskChatbot) Got locked intent: -" + locked_intent + "-");
      if (locked_intent) {
        // const tdclient = new TiledeskClient({
        //   projectId: this.projectId,
        //   token: this.token,
        //   APIURL: this.APIURL,
        //   APIKEY: this.APIKEY,
        //   log: false
        // });
        // it only gets the locked_intent
        // const faq = await this.botsDataSource.getByIntentDisplayName(this.botId, locked_intent);
        const faq = await this.botsDataSource.getByIntentDisplayNameCache(this.botId, locked_intent, this.tdcache);
        winston.debug("(TiledeskChatbot) Locked intent. Got faqs: ", faq);
        let reply;
        if (faq) {
          reply = await this.execIntent(faq, message, lead);//, bot);
        }
        else {
          reply = {
            "text": "An error occurred while getting locked intent:'" + locked_intent + "'",
            "attributes": {
              "subtype": "info"
            }
          }
          // because of some race condition, during a mixed ReplyV2 Action button + Replace bot an
          // intent can be found locked outside of the original chatbot scope.
          // The temp solution is to immediatly unlock the intent and let the flow continue.
          await this.unlockIntent(this.requestId);
          await this.unlockAction(this.requestId);
        }
        resolve(reply);
        return;
      }


      let explicit_intent_name = null;
      // Explicit intent invocation
      if (message.text && message.text.startsWith("/")) {
        winston.verbose("(TiledeskChatbot) Intent was explicitly invoked: " + message.text);
        let intent_name = message.text.substring(message.text.indexOf("/") + 1);
        winston.verbose("(TiledeskChatbot) Invoked Intent: " + intent_name)
        explicit_intent_name = intent_name;
      }
      
      // Intent invocation with action
      if (message.attributes && message.attributes.action) {
        winston.debug("(TiledeskChatbot) Message has action: ", message.attributes.action)
        explicit_intent_name = message.attributes.action;
        winston.verbose("(TiledeskChatbot) Intent was explicitly invoked with an action:", explicit_intent_name)
      }

      if (explicit_intent_name) {
        winston.verbose("(TiledeskChatbot) Processing explicit intent:", explicit_intent_name)
        // look for parameters
        const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
        winston.debug("(TiledeskChatbot) parsed intent:", intent);
        let reply;
        if (!intent || (intent && !intent.name)) {
          winston.verbose("(TiledeskChatbot) Invalid intent:", explicit_intent_name)
          resolve();
        }
        else {
          winston.verbose("(TiledeskChatbot) Processing intent:", explicit_intent_name)
          let faq = await this.botsDataSource.getByIntentDisplayNameCache(this.botId, intent.name, this.tdcache);
          if (faq) {
            winston.verbose("(TiledeskChatbot) Got a reply (faq) by Intent name:", faq)
            try {
              if (intent.parameters) {
                for (const [key, value] of Object.entries(intent.parameters)) {
                  winston.verbose("(TiledeskChatbot) Adding attribute from intent invocation /intentName{}: " + key + " " + value);
                  this.addParameter(key, value);                  
                }
              }
              reply = await this.execIntent(faq, message, lead);
              resolve(reply);
              return;
            }
            catch(error) {
              winston.error("(TiledeskChatbot) Error adding parameter: ", error);
              reject(error);
            }
          }
          else {
            winston.verbose("(TiledeskChatbot) Intent not found: " + explicit_intent_name);
            resolve()
          }
        }
      }

      // SEARCH INTENTS
      let faqs;
      try {
        faqs = await this.botsDataSource.getByExactMatch(this.botId, message.text);
        winston.verbose("(TiledeskChatbot) Got faq by exact match: " + faqs);
      }
      catch (error) {
        winston.error("(TiledeskChatbot) An error occurred during exact match: ", error);
      }
      if (faqs && faqs.length > 0 && faqs[0].answer) {
        winston.debug("(TiledeskChatbot) exact match or action faq: ", faqs[0]);
        let reply;
        const faq = faqs[0];
        try {
          reply = await this.execIntent(faq, message, lead);//, bot);
        }
        catch(error) {
          winston.error("(TiledeskChatbot) An error occured during exact match execIntent(): ", error);
          reject(error);
          return;
        }
        resolve(reply);
        return;
      }
      else { // NLP
        winston.verbose("(TiledeskChatbot) Chatbot NLP decoding intent...");
        let intents;
        try {
          intents = await this.intentsFinder.decode(this.botId, message.text);
          winston.verbose("(TiledeskChatbot) Tiledesk AI intents found:", intents);
        }
        catch(error) {
          winston.error("(TiledeskChatbot) An error occurred on IntentsFinder.decode() (/model/parse error):" + error.message);
          // recover on fulltext
          if (this.backupIntentsFinder) {
            winston.debug("(TiledeskChatbot) Using backup Finder:", this.backupIntentsFinder);
            intents = await this.backupIntentsFinder.decode(this.botId, message.text);
            winston.debug("(TiledeskChatbot) Got intents from backup finder: ", intents);
          }
        }
        winston.debug("(TiledeskChatbot) NLP intents found: ", intents);
        if (intents && intents.length > 0) {
          let faq = await this.botsDataSource.getByIntentDisplayNameCache(this.botId, intents[0].intent_display_name, this.tdcache);
          let reply;
          try {
            reply = await this.execIntent(faq, message, lead);//, bot);
          }
          catch(error) {
            winston.error("(TiledeskChatbot) An error occurred during NLP decoding: ", error);
            reject(error);
            return;
          }
          resolve(reply);
          return;
        }
        else {
          let fallbackIntent = await this.botsDataSource.getByIntentDisplayNameCache(this.botId, "defaultFallback", this.tdcache);
          if (!fallbackIntent) {
            resolve(null);
            return;
          }
          else {
            let reply;
            try {
              reply = await this.execIntent(fallbackIntent, message, lead);//, bot);
            }
            catch(error) {
              winston.error("(TiledeskChatbot) An error occurred during defaultFallback: ", error);
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

    winston.debug("(TiledeskChatbot) execIntent requestId: " + this.requestId)
    winston.debug("(TiledeskChatbot) execIntent token: " + this.token)
    winston.debug("(TiledeskChatbot) execIntent projectId: " + this.projectId)
    
    if (this.tdcache) {
      const requestKey = "tilebot:" + this.requestId
      await this.tdcache.setJSON(requestKey, this.request);
    }
    
    let intent_name = answerObj.intent_display_name
    let intent_form = answerObj.form;

    winston.debug("(TiledeskChatbot) IntentForm.isValidForm(intent_form)" + IntentForm.isValidForm(intent_form));

    let clientUpdateUserFullname = null;
    if (IntentForm.isValidForm(intent_form)) {
      await this.lockIntent(this.requestId, intent_name);
      const user_reply = message.text;
      let form_reply = await this.execIntentForm(user_reply, intent_form);
      if (!form_reply.canceled && form_reply.message) {
        winston.debug("(TiledeskChatbot) Sending form reply...", form_reply.message)
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

        winston.debug("(TiledeskChatbot) FORM End");
        winston.debug("(TiledeskChatbot) Unlocking intent for request: " + this.requestId);
        winston.debug("(TiledeskChatbot) Populate data on lead:", lead);

        this.unlockIntent(this.requestId);
        if (lead) {
          this.populatePrechatFormAndLead(lead._id, this.requestId);
        }
        else {
          winston.debug("(TiledeskChatbot) No lead. Skipping populatePrechatFormAndLead()");
        }
        const all_parameters = await this.allParameters();
        if (all_parameters && all_parameters["userFullname"]) {
          clientUpdateUserFullname = all_parameters["userFullname"];
        }
      }
      else if (form_reply.canceled) {
        winston.verbose("(TiledeskChatbot) Form canceled");
        winston.debug("(TiledeskChatbot) Unlocking intent due to canceling, for request", this.requestId);
        this.unlockIntent(this.requestId);
        winston.debug("(TiledeskChatbot) Sending form 'cancel' reply...", form_reply.message)
        // reply with this message (ex. please enter your fullname)
        if (!form_reply.message.attributes) {
          form_reply.message.attributes = {}
        }
        form_reply.message.attributes.fillParams = true;
        form_reply.message.attributes.splits = true;
        form_reply.message.attributes.directives = true;
        // used by the Clients to get some info about the intent that generated this reply
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
    if (answerObj.actions) {
      const actions_length = answerObj.actions.length;
      TiledeskChatbotUtil.addConnectAction(answerObj);
    }

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
      winston.verbose("(TiledeskChatbot) Intent with no actions or answer.", answerObj);
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
      intent_id: answerObj.intent_id,
      is_fallback: false,
      confidence: answerObj.score,
      question_payload: question_payload,
      botId: this.botId,
      bot: this.bot
    }
    static_bot_answer.attributes.intent_info = intent_info;
    static_bot_answer.attributes.webhook = answerObj.webhook_enabled;

    if (clientUpdateUserFullname) {
      winston.verbose("(TiledeskChatbot) We must clientUpdateUserFullname with:" + clientUpdateUserFullname)
      static_bot_answer.attributes.updateUserFullname = clientUpdateUserFullname;
    }
    // exec webhook
    winston.debug("(TiledeskChatbot) exec webhook on bot:", this.bot);
    const bot_answer = await this.execWebhook(static_bot_answer, message, this.bot, context, this.token);
    winston.debug("(TiledeskChatbot) bot_answer ready:", bot_answer);
    return bot_answer;
  }

  
  async lockIntent(requestId, intent_name) {
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
  }

  async lockAction(requestId, action_id) {
    if (this.tdcache != null && requestId != null && action_id != null) {
      await this.tdcache.set("tilebot:requests:"  + requestId + ":action:locked", action_id);
    }
    else {
      winston.error("(TiledeskChatbot) lockAction recoverable error, one of requestId: " + requestId + " action_id: " + action_id + " is null");
    }
  }
  
  async currentLockedAction(requestId) {
    if (this.tdcache) {
      return await this.tdcache.get("tilebot:requests:"  + requestId + ":action:locked");
    }
    else {
      return null;
    }
  }
  
  async unlockAction(requestId) {
    await this.tdcache.del("tilebot:requests:"  + requestId + ":action:locked");
  }

  async addParameter(parameter_name, parameter_value) {
    await TiledeskChatbot.addParameterStatic(this.tdcache, this.requestId, parameter_name, parameter_value);
  }

  async getParameter(parameter_name) {
    return await TiledeskChatbot.getParameterStatic(this.tdcache, this.requestId, parameter_name);
  }

  async deleteParameter(parameter_name) {
    await TiledeskChatbot.deleteParameterStatic(this.tdcache, this.requestId, parameter_name);
  }

  static async addParameterStatic(_tdcache, requestId, parameter_name, parameter_value) {
    if (parameter_name === null || parameter_name === undefined) {
      return;
    }
    const parameter_key = TiledeskChatbot.requestCacheKey(requestId) + ":parameters";
    const parameter_value_s = JSON.stringify(parameter_value);
    if (parameter_value_s?.length > 20000000) {
      return;
    }
    await _tdcache.hset(parameter_key, parameter_name, parameter_value_s);
  }

  async allParameters() {
    return await TiledeskChatbot.allParametersStatic(this.tdcache, this.requestId);
  }

  static async allParametersStatic(_tdcache, requestId) {
    const parameters_key = TiledeskChatbot.requestCacheKey(requestId) + ":parameters";
    const attributes__as_string_map = await _tdcache.hgetall(parameters_key);
    let attributes_native_values = {};
    if (attributes__as_string_map !== null) {
      for (const [key, value] of Object.entries(attributes__as_string_map)) {
        try {
          attributes_native_values[key] = JSON.parse(value);
        }
        catch(err) {
          winston.error("(TiledeskChatbot) An error occurred while JSON.parse(). Parsed value: " + value + " in allParametersStatic(). Error: " + JSON.stringify(err));
        }
      }
    }
    return attributes_native_values;
  }

  async allParametersInstance(_tdcache, requestId) {
    return await _tdcache.hgetall(
      TiledeskChatbot.requestCacheKey(requestId) + ":parameters");
  }

  static async getParameterStatic(_tdcache, requestId, key) {
    let value = await _tdcache.hget(
      TiledeskChatbot.requestCacheKey(requestId) + ":parameters", key);
    try {
      value = JSON.parse(value);
    }
    catch(error) {
      winston.error("(TiledeskChatbot) Error parsing to JSON an Attribute:", error);
    }
    return value;
  }

  static async deleteParameterStatic(_tdcache, requestId, paramName) {
    return await _tdcache.hdel(
      TiledeskChatbot.requestCacheKey(requestId) + ":parameters", paramName);
  }

  static async checkStep(_tdcache, requestId, max_steps, max_execution_time, log) {
    winston.verbose("(TiledeskChatbot) Checking on MAX_STEPS: " + max_steps);
    // let go_on = true; // continue
    const parameter_key = TiledeskChatbot.requestCacheKey(requestId) + ":step";
    winston.verbose("(TiledeskChatbot) __parameter_key:", parameter_key);
    await _tdcache.incr(parameter_key);
    let _current_step = await _tdcache.get(parameter_key);
    let current_step = Number(_current_step);
    if (current_step > max_steps) {
      winston.verbose("(TiledeskChatbot) max_steps limit just violated");
      winston.verbose("(TiledeskChatbot) Current Step > Max Steps: " + current_step);
      return {
        error: "Anomaly detection. MAX ACTIONS (" + max_steps + ") exeeded."
      };
    }
    // else {
    //   go_on = true;
    // }

    // check execution_time
    // const TOTAL_ALLOWED_EXECUTION_TIME = 1000 * 60 // * 60 * 12 // 12 hours
    let start_time_key = TiledeskChatbot.requestCacheKey(requestId) + ":started";
    let start_time = await _tdcache.get(start_time_key);
    const now = Date.now();
    if (start_time === null || Number(start_time) === 0) {
      await _tdcache.set(start_time_key, now);
      return {};
    }
    else {
      const execution_time = now - Number(start_time);
      if (execution_time > max_execution_time) {
        winston.verbose("(TiledeskChatbot) execution_time > TOTAL_ALLOWED_EXECUTION_TIME. Stopping flow");
        return {
          error: "Anomaly detection. MAX EXECUTION TIME (" + max_execution_time + " ms) exeeded."
        };
      }
    }
    return {};
  }

  static async resetStep(_tdcache, requestId) {
    const parameter_key = TiledeskChatbot.requestCacheKey(requestId) + ":step";
    if (_tdcache) {
      await _tdcache.set(parameter_key, 0);
    }
  }

  static async resetStarted(_tdcache, requestId) {
    const parameter_key = TiledeskChatbot.requestCacheKey(requestId) + ":started";
    if (_tdcache) {
      await _tdcache.set(parameter_key, 0);
    }
  }

  static async currentStep(_tdcache, requestId) {
    const parameter_key = TiledeskChatbot.requestCacheKey(requestId) + ":step";
    return await _tdcache.get(parameter_key);
  }

  static requestCacheKey(requestId) {
    const request_key = "tilebot:requests:" + requestId;
    return request_key;
  }
  
  async execWebhook(static_bot_answer, userMessage, bot, context) {
    winston.verbose("(TiledeskChatbot) static_bot_answer.attributes.webhook:" + static_bot_answer.attributes.webhook);
    if (static_bot_answer.attributes && static_bot_answer.attributes.webhook && static_bot_answer.attributes.webhook === true) {
      const variables = await this.allParameters();
      context.variables = variables;
      winston.debug("(TiledeskChatbot) adding variables to webhook context:", context.variables);
    }
    const messagePipeline = new MessagePipeline(static_bot_answer, context);
    const webhookurl = bot.webhook_url;
    messagePipeline.addPlug(new WebhookChatbotPlug(userMessage.request, webhookurl, this.token, this.log));
    const bot_answer = await messagePipeline.exec();
    return bot_answer;
  }

  async execIntentForm(userInputReply, form) {
    winston.verbose("(TiledeskChatbot) Executing intent form...")
    let all_parameters = await this.allParameters();
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
    winston.verbose("(TiledeskChatbot) (populatePrechatFormAndLead) leadId:" + leadId);
    winston.verbose("(TiledeskChatbot) (populatePrechatFormAndLead) requestId:" + requestId);
    if (!leadId && !requestId) {
      winston.verbose("(TiledeskChatbot) (populatePrechatFormAndLead) !leadId && !requestId");
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
    winston.debug("(TiledeskChatbot) (populatePrechatFormAndLead) parameters_key:" + JSON.stringify(all_parameters));
    if (all_parameters) {
      winston.debug("(TiledeskChatbot) (populatePrechatFormAndLead) userEmail:" + all_parameters['userEmail']);
      winston.debug("(TiledeskChatbot) (populatePrechatFormAndLead) userFullname:" + all_parameters['userFullname']);
      winston.debug("(TiledeskChatbot) (populatePrechatFormAndLead) userPhone:" + all_parameters['userPhone']);
      let nativeAttributes = {
        email: all_parameters['userEmail'],
        fullname: all_parameters['userFullname'],
        phone: all_parameters['userPhone']
      }
      tdclient.updateLead(leadId, nativeAttributes, null, null, () => {
        winston.verbose("(TiledeskChatbot) Lead updated.")
      });
    };
  }
    
}

module.exports = { TiledeskChatbot };