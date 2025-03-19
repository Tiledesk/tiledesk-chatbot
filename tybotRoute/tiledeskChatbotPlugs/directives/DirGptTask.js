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

class DirGptTask {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.chatbot = this.context.chatbot;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.projectId = this.context.projectId;
    this.token = this.context.token;
    this.intentDir = new DirIntent(context);
    this.API_ENDPOINT = this.context.API_ENDPOINT;
    this.log = context.log;
  }

  execute(directive, callback) {
    winston.verbose("Execute GptTask directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirGptTask Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
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
      winston.debug("(DirGptTask) Error: question attribute is mandatory. Executing condition false...")
      if (falseIntent) {
        await this.chatbot.addParameter("flowError", "GPT Error: question attribute is undefined");
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
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
        winston.debug("(DirGptTask)  transcript string: " + transcript_string)

      if (transcript_string) {
        transcript = await TiledeskChatbotUtil.transcriptJSON(transcript_string);
        winston.debug("(DirGptTask)  transcript: ", transcript)
      } else {
        winston.debug("(DirGptTask)  transcript_string is undefined. Skip JSON translation for chat history");
      }
    }

    const openai_url = process.env.OPENAI_ENDPOINT + "/chat/completions";
    winston.debug("(DirGptTask)  openai_url " + openai_url);

    let key = await integrationService.getKeyFromIntegrations(this.projectId, 'openai', this.token);
    if (!key) {
      winston.debug("(DirGptTask) - Key not found in Integrations. Searching in kb settings...");
      key = await this.getKeyFromKbSettings();
    }

    if (!key) {
      winston.debug("(DirGptTask)  - Retrieve public gptkey")
      key = process.env.GPTKEY;
      publicKey = true;
    }

    if (!key) {
      winston.error("(DirGptTask) gptkey is mandatory");
      await this.#assignAttributes(action, answer);
      if (falseIntent) {
        await this.chatbot.addParameter("flowError", "GPT Error: gpt apikey is undefined");
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    if (publicKey === true) {
      let keep_going = await this.checkQuoteAvailability();
      if (keep_going === false) {

        await this.chatbot.addParameter("flowError", "GPT Error: tokens quota exceeded");
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
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
          await this.#assignAttributes(action, answer);
          if (falseIntent) {
            await this.chatbot.addParameter("flowError", "GPT Error: " + err.response?.data?.error?.message);
            await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
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
        
          await this.#assignAttributes(action, answer);

          if (publicKey === true) {
            let tokens_usage = {
              tokens: resbody.usage.total_tokens,
              model: json.model
            }
            this.updateQuote(tokens_usage);
          }

          if (trueIntent) {
            await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
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

  async #executeCondition(result, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, callback) {
    let trueIntentDirective = null;
    if (trueIntent) {
      trueIntentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
    }
    let falseIntentDirective = null;
    if (falseIntent) {
      falseIntentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
    }
    if (result === true) {
      if (trueIntentDirective) {
        this.intentDir.execute(trueIntentDirective, () => {
          if (callback) {
            callback();
          }
        })
      }
      else {
        winston.debug("(DirGptTask) No trueIntentDirective specified"); 
        if (callback) {
          callback();
        }
      }
    }
    else {
      if (falseIntentDirective) {
        this.intentDir.execute(falseIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        winston.debug("(DirGptTask) No falseIntentDirective specified"); 
        if (callback) {
          callback();
        }
      }
    }
  }

  async #assignAttributes(action, answer) {
    winston.debug("(DirGptTask) assignAttributes action: ", action)
    winston.debug("(DirGptTask) assignAttributes answer: " + answer)

    if (this.context.tdcache) {
      if (action.assignReplyTo && answer) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignReplyTo, answer);
      }
    }
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

  async checkQuoteAvailability() {
    return new Promise((resolve) => {

      const HTTPREQUEST = {
        url: this.API_ENDPOINT + "/" + this.context.projectId + "/quotes/tokens",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      }
      winston.debug("(DirGptTask) check quote availability HttpRequest ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            resolve(true)
          } else {
            if (resbody.isAvailable === true) {
              resolve(true)
            } else {
              resolve(false)
            }
          }
        }
      )
    })
  }

  async updateQuote(tokens_usage) {
    return new Promise((resolve, reject) => {

      const HTTPREQUEST = {
        url: this.API_ENDPOINT + "/" + this.context.projectId + "/quotes/incr/tokens",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        json: tokens_usage,
        method: "POST"
      }
      winston.debug("(DirGptTask) update quote HttpRequest ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            winston.debug("(DirGptTask) Increment tokens quote err: ", err);
            reject(false)
          } else {
            winston.debug("(DirGptTask)  Increment token quote resbody: ", resbody);
            resolve(true);
          }
        }
      )
    })
  }

}

module.exports = { DirGptTask }