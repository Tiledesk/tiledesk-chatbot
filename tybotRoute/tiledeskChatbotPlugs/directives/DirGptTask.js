const axios = require("axios").default;
const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../Filler");
let https = require("https");
const { DirIntent } = require("./DirIntent");
const { TiledeskChatbotConst } = require("../../engine/TiledeskChatbotConst");
const { TiledeskChatbotUtil } = require("../../utils/TiledeskChatbotUtil");
require('dotenv').config();
const winston = require('../../utils/winston');
const httpUtils = require("../../utils/HttpUtils");
const integrationService = require("../../services/IntegrationService");
const quotasService = require("../../services/QuotasService");
const { BaseDirective } = require("../BaseDirective");
const { Directives } = require('./Directives');

class DirGptTask extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.GPT_TASK];

  constructor(context) {
    super(context);
    this.chatbot = this.context.chatbot;

    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
    winston.verbose("Execute GptTask directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirGptTask Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[ChatGPT Task] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirGptTask) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirGptTask) Error: tdcache is mandatory");
      callback();
      return;
    }

    let publicKey = false;
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;
    let transcript;

    winston.debug("(DirGptTask) trueIntent " + trueIntent)
    winston.debug("(DirGptTask) falseIntent " + falseIntent)
    winston.debug("(DirGptTask) trueIntentAttributes " + trueIntentAttributes)
    winston.debug("(DirGptTask) falseIntentAttributes " + falseIntentAttributes)

    // default value
    let answer = "No answer.";
    let model = "gpt-3.5-turbo";

    if (!action.question || action.question === '') {
      this.logger.warn("[ChatGPT Task] question attribute is mandatory");
      winston.debug("(DirGptTask) Error: question attribute is mandatory. Executing condition false...")
      if (falseIntent) {
        await this.chatbot.addParameter("flowError", "GPT Error: question attribute is undefined");
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    const filler = new Filler();
    const filled_question = filler.fill(action.question, requestVariables);
    const filled_context = filler.fill(action.context, requestVariables);

    let max_tokens = action.max_tokens;
    let temperature = action.temperature;
    
    if (action.model) {
      model = action.model;
    }

    winston.debug("(DirGptTask) max_tokens: " + max_tokens);
    winston.debug("(DirGptTask) temperature: " + temperature);

    if (action.history) {
      let transcript_string = await TiledeskChatbot.getParameterStatic(
        this.context.tdcache,
        this.context.requestId,
        TiledeskChatbotConst.REQ_TRANSCRIPT_KEY);
        winston.debug("(DirGptTask) transcript string: " + transcript_string)

      if (transcript_string) {
        transcript = await TiledeskChatbotUtil.transcriptJSON(transcript_string);
        winston.debug("(DirGptTask) transcript: ", transcript)
      } else {
        winston.debug("(DirGptTask) transcript_string is undefined. Skip JSON translation for chat history");
      }
    }

    const openai_url = process.env.OPENAI_ENDPOINT + "/chat/completions";
    winston.debug("(DirGptTask)  openai_url " + openai_url);

    let key = await integrationService.getKeyFromIntegrations(this.projectId, 'openai', this.token);
    if (!key) {
      this.logger.native("[ChatGPT Task] Key not found in Integrations.");
      winston.debug("(DirGptTask) - Key not found in Integrations. Searching in kb settings...");
      key = await this.getKeyFromKbSettings();
    }

    if (!key) {
      this.logger.native("[ChatGPT Task] Retrieve shared gptkey.");
      winston.debug("(DirGptTask) - Retrieve public gptkey")
      key = process.env.GPTKEY;
      publicKey = true;
    }

    if (!key) {
      this.logger.error("[ChatGPT Task] OpenAI key is mandatory");
      winston.error("(DirGptTask) gptkey is mandatory");
      await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);
      if (falseIntent) {
        await this.chatbot.addParameter("flowError", "GPT Error: gpt apikey is undefined");
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    if (publicKey === true) {
      let keep_going = await quotasService.checkQuoteAvailability(this.projectId, this.token);
      if (keep_going === false) {
        this.logger.warn("[ChatGPT Task] OpenAI tokens quota exceeded");
        await this.chatbot.addParameter("flowError", "GPT Error: tokens quota exceeded");
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback();
        return;
      }
    }

    let json = {
      model: action.model,
      messages: [],
      max_tokens: action.max_tokens,
      temperature: action.temperature,
    }

    if (action.context) {
      let message = { role: "system", content: filled_context }
      json.messages.push(message);
    }

    if (transcript) {
      transcript.forEach(msg => {
        if (!msg.content.startsWith('/')) {
          let message = { role: msg.role, content: msg.content }
          json.messages.push(message)
        }
      })
      json.messages.push({ role: "user", content: filled_question });
    } else {
      let message = { role: "user", content: filled_question };
      json.messages.push(message);
    } 

    if (action.formatType && action.formatType !== 'none') {
      json.response_format = {
        type: action.formatType
      }
    }
    
    winston.debug("(DirGptTask) json: ", json)

    const HTTPREQUEST = {
      url: openai_url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      json: json,
      method: 'POST'
    }
    winston.debug("(DirGptTask) HttpRequest: ", HTTPREQUEST);
    
    httpUtils.request(
      HTTPREQUEST, async (err, resbody) => {
        if (err) {
          winston.debug("(DirGptTask) openai err: ", err);
          winston.debug("(DirGptTask) openai err: " + err.response?.data?.error?.message);
          this.logger.error("[ChatGPT Task] Completions error: ", err.response?.data?.error?.message);
          await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);
          if (falseIntent) {
            await this.chatbot.addParameter("flowError", "GPT Error: " + err.response?.data?.error?.message);
            await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        } else {
          winston.debug("(DirGptTask) resbody: ", resbody);
          answer = resbody.choices[0].message.content;

          if (action.formatType === 'json_object' || action.formatType === undefined || action.formatType === null) {
            answer = await this.convertToJson(answer);
          }
        
          this.logger.native("[ChatGPT Task] Completions answer: ", answer);
          
          await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);

          if (publicKey === true) {
            let tokens_usage = {
              tokens: resbody.usage.total_tokens,
              model: json.model
            }
            quotasService.updateQuote(this.projectId, this.token, tokens_usage);
          }

          if (trueIntent) {
            await this._executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        }
      }
    )

  }

  async convertToJson(data) {

    return new Promise((resolve) => {
      let json = null;
      try {
        json = JSON.parse(data);
        resolve(json)
      } catch (err) {
        resolve(data)
      }
    })

  }

  async getKeyFromKbSettings() {
    return new Promise((resolve) => {

      const KB_HTTPREQUEST = {
        url: this.API_ENDPOINT + "/" + this.context.projectId + "/kbsettings",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      }
      winston.debug("(DirGptTask) KB HttpRequest ", KB_HTTPREQUEST); 

      httpUtils.request(
        KB_HTTPREQUEST, async (err, resbody) => {
          if (err) {
            winston.error("(DirGptTask) Get KnowledgeBase err:", err.message);
            resolve(null);
          } else {
            if (!resbody.gptkey) {
              resolve(null);
            } else {
              resolve(resbody.gptkey);
            }
          }
        }
      )
    })
  }

}

module.exports = { DirGptTask }