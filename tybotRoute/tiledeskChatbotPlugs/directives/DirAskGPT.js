const axios = require("axios").default;
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');
let https = require("https");
const { DirIntent } = require("./DirIntent");
require('dotenv').config();
const winston = require('../../utils/winston');
const httpUtils = require("../../utils/HttpUtils");
const integrationService = require("../../services/IntegrationService");

class DirAskGPT {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.projectId = this.context.projectId;
    this.token = this.context.token;
    this.intentDir = new DirIntent(context);
    this.API_ENDPOINT = this.context.API_ENDPOINT;
  }

  execute(directive, callback) {
    winston.verbose("Execute AskGPT directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirAskGPT Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirAskGPT) Action: ", action);
    if (!this.tdcache) {
      winston.error("Error: DirAskGPT tdcache is mandatory");
      callback();
      return;
    }

    let publicKey = false;
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    winston.debug("(DirAskGPT) trueIntent " + trueIntent)
    winston.debug("(DirAskGPT) falseIntent " + falseIntent)
    winston.debug("(DirAskGPT) trueIntentAttributes " + trueIntentAttributes)
    winston.debug("(DirAskGPT) falseIntentAttributes " + falseIntentAttributes)

    // default values
    let answer = "No answers";
    let source = null;

    if (!action.question || action.question === '') {
      winston.error("(DirAskGPT) Error: question attribute is mandatory. Executing condition false...");
      await this.#assignAttributes(action, answer, source);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
      }
      callback(true);
      return;
    }

    if (!action.kbid) {
      winston.error("(DirAskGPT) Error: kbid attribute is mandatory. Executing condition false...");
      await this.#assignAttributes(action, answer, source);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes)
      }
      callback(true);
      return;
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );

    const filler = new Filler();
    const filled_question = filler.fill(action.question, requestVariables);

    const kb_endpoint = process.env.KB_ENDPOINT;
    winston.verbose("DirAskGPT KbEndpoint URL: ", kb_endpoint);

    let key = await integrationService.getKeyFromIntegrations(this.projectId, 'openai', this.token);
    if (!key) {
      winston.debug("(DirAskGPT) - Key not found in Integrations. Searching in kb settings...");
      key = await this.getKeyFromKbSettings();
    }

    if (!key) {
      winston.debug("(DirAskGPT) - Retrieve public gptkey")
      key = process.env.GPTKEY;
      publicKey = true;
    }

    if (!key) {
      winston.error("(DirAskGPT) Error: gptkey is mandatory");
      await this.#assignAttributes(action, answer);
      if (falseIntent) {
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
        winston.debug("(DirAskGPT) - Quota exceeded for tokens. Skip the action")
        callback();
        return;
      }
    }

    let json = {
      question: filled_question,
      kbid: action.kbid,
      gptkey: key
    };
    winston.debug("(DirAskGPT)DirAskGPT json:", json); 

    const HTTPREQUEST = {
      url: kb_endpoint + "/qa",
      json: json,
      method: "POST"
    }
    winston.debug("(DirAskGPT) HttpRequest", HTTPREQUEST); 
    
    httpUtils.request(
      HTTPREQUEST, async (err, resbody) => {

        winston.debug("(DirAskGPT) resbody:", resbody); 
        let answer = resbody.answer;
        let source = resbody.source_url;
        await this.#assignAttributes(action, answer, source);
        
        if (err) {
          winston.error("(DirAskGPT) error: ", err);
          if (callback) {
            if (falseIntent) {
              await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
              callback(true);
              return;
            }
            callback();
            return;
          }
        }
        else if (resbody.success === true) {

          // if (publicKey === true) {
          //   let token_usage = resbody.usage.total_tokens;
          //   this.updateQuote(token_usage);
          // }
          
          if (trueIntent) {
            await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        } else {
          if (falseIntent) {
            await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        }
      }
    )
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
        winston.debug("(DirAskGPT) No trueIntentDirective specified");
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
        winston.debug("(DirAskGPT) No falseIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
  }

  async #assignAttributes(action, answer, source) {
    winston.debug("(DirAskGPT) assignAttributes action:", action)
    winston.debug("(DirAskGPT) assignAttributes answer:", answer)
    winston.debug("(DirAskGPT) assignAttributes source:", source)
    if (this.context.tdcache) {
      if (action.assignReplyTo && answer) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignReplyTo, answer);
      }
      if (action.assignSourceTo && source) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignSourceTo, source);
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
      winston.debug("(DirAskGPT) KB HttpRequest ", KB_HTTPREQUEST);

      httpUtils.request(
        KB_HTTPREQUEST, async (err, resbody) => {
          if (err) {
            winston.error("DirAskGPT Get kb settings error ", err?.response?.data);
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

module.exports = { DirAskGPT }