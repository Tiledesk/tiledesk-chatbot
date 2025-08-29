const axios = require("axios").default;
const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../Filler");
let https = require("https");
const { DirIntent } = require("./DirIntent");
const { TiledeskChatbotConst } = require("../../engine/TiledeskChatbotConst");
const { TiledeskChatbotUtil } = require("../../utils/TiledeskChatbotUtil");
require('dotenv').config();
const winston = require('../../utils/winston');
const Utils = require("../../utils/HttpUtils");
const utils = require("../../utils/HttpUtils");
const httpUtils = require("../../utils/HttpUtils");
const integrationService = require("../../services/IntegrationService");
const { Logger } = require("../../Logger");
const { randomUUID } = require("crypto");


class DirAiCondition {

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
    this.API_ENDPOINT = this.context.API_ENDPOINT;
    
    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.verbose("Execute AiAiCondition directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.debug("DirAiAiCondition Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Ai Condition] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("DirAiCondition action:", action);
    if (!this.tdcache) {
      winston.error("Error: DirAiCondition tdcache is mandatory");
      callback();
      return;
    }

    let intents = action.intents;
    // intents = [
    //   {
    //     "label": "26efa629-686e-4a23-a2f8-38c8f5beb408",
    //     "prompt": "user asking for medical information",
    //     "intentId": "#9b1c29c1671847dba6db561f771a142e"
    //   }
    // ]
    let falllbackIntent = action.falllbackIntent; // non condition met block
    let falseIntent = action.falllbackIntent; // On error block
    await this.checkMandatoryParameters(action).catch( async (missing_param) => {
      this.logger.error(`[AI Condition] missing attribute '${missing_param}'`);
      await this.chatbot.addParameter("flowError", "AiPrompt Error: '" + missing_param + "' attribute is undefined");
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return Promise.reject();
      }
      callback();
      return Promise.reject();
    })
    
    // fill attributes
    let requestVariables = null;
    requestVariables =
    await TiledeskChatbot.allParametersStatic(
      this.tdcache, this.requestId
    )
    const filler = new Filler();

    let conditions = "";
    intents.forEach( function(intent) {
      let filled_prompt = filler.fill(intent.prompt, requestVariables);
      conditions += `- label: ${intent.label} when: ${filled_prompt}\n`
    });

    let instructions = filler.fill(action.instructions, requestVariables);
    let condition_prompt = TiledeskChatbotUtil.AiConditionPromptBuilder(prompt_header, intents, instructions)

    // let raw_condition_prompt = `Reply with the label satisfying the corresponding condition or with “fallback” if all conditions are false.
    // If more than one condition is true, answer with the first label corresponding to the true condition, following the order from top to bottom.
    // ${conditions}
    // ${instructions}`
    
    // const filled_question = condition_prompt; //filler.fill(action.question, requestVariables);
    const filled_context = filler.fill(action.context, requestVariables);

    // evaluate

    let AI_endpoint = process.env.AI_ENDPOINT;
    winston.verbose("DirAiPrompt AI_endpoint " + AI_endpoint);

    let headers = {
      'Content-Type': 'application/json'
    }
    
    let key;
    let ollama_integration;

    if (action.llm === 'ollama') {
      ollama_integration = await integrationService.getIntegration(this.projectId, action.llm, this.token).catch( async (err) => {
        this.logger.error("[AI Condition] Error getting ollama integration.")
        winston.error("DirAiPrompt Error getting ollama integration: ", err);
        await this.chatbot.addParameter("flowError", "Ollama integration not found");
        if (falseIntent) {
          await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      });

    } else {
      key = await integrationService.getKeyFromIntegrations(this.projectId, action.llm, this.token);
  
      if (!key) {
        this.logger.error("[AI Condition] llm key not found in integrations");
        winston.error("Error: DirAiPrompt llm key not found in integrations");
        await this.chatbot.addParameter("flowError", "AiPrompt Error: missing key for llm " + action.llm);
        if (falseIntent) {
          await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      }
    }

    let json = {
      question: condition_prompt,
      llm: action.llm,
      model: action.model,
      llm_key: key,
      temperature: action.temperature,
      max_tokens: action.max_tokens
    }

    if (action.context) {
      json.system_context = filled_context;
    }
    // if (transcript) {
    //   json.chat_history_dict = await this.transcriptToLLM(transcript);
    // }

    if (action.llm === 'ollama') {
      json.llm_key = "";
      json.model = {
        name: action.model,
        url: ollama_integration.value.url,
        token: ollama_integration.value.token
      }
      json.stream = false

    }

    winston.debug("DirAiPrompt json: ", json);

    const HTTPREQUEST = {
      url: AI_endpoint + "/ask",
      headers: headers,
      json: json,
      method: 'POST'
    }
    winston.debug("DirAiPrompt HttpRequest: ", HTTPREQUEST);

    httpUtils.request(
      HTTPREQUEST, async (err, resbody) => {
        if (err) {
          winston.error("DirAiPrompt openai err: ", err);
          await this.#assignAttributes(action, answer);
          let error;
          if (err.response?.data?.detail[0]) {
            error = err.response.data.detail[0]?.msg;
          } else if (err.response?.data?.detail?.answer) {
            error = err.response.data.detail.answer;
          } else {
            error = JSON.stringify(err.response.data);
          }
          this.logger.error("[AI Condition] error executing action: ", error);
          if (falseIntent) {
            await this.chatbot.addParameter("flowError", "AiPrompt Error: " + error);
            await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        } else {

          winston.debug("DirAiPrompt resbody: ", resbody);
          answer = resbody.answer;
          this.logger.native("[AI Condition] answer: ", answer);
        
          await this.#assignAttributes(action, answer);

          if (answer === "fallback") {
            if (falllbackIntent) {
              this.#executeIntent(falllbackIntent, () => {
                if (callback) {
                    callback(true);
                    return;
                  }
              });
            }
          }
          else {
            intents.forEach( i => {
              if (i.label === answer) {
                this.#executeIntent(i.intentId, () => {
                if (callback) {
                    callback(true);
                    return;
                  }
              });
              }
            });
          }
          this.logger.error("[AI Condition] error executing action: condition label not found in intents list");
          if (falseIntent) {
            await this.chatbot.addParameter("flowError", "[AI Condition] error executing action: condition label not found in intents list");
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

  async checkMandatoryParameters(action) {
    return new Promise((resolve, reject) => {
      let params = ['question', 'llm', 'model']; // mandatory params
      params.forEach((p) => {
        if (!action[p]) {
          reject(p)
        }
      })
      resolve(true);
    })
  }

  /**
   * Transforms the transcirpt array in a dictionary like '0': { "question": "xxx", "answer":"xxx"}
   * merging consecutive messages with the same role in a single question or answer.
   * If the first message was sent from assistant, this will be deleted.
   */
  // async transcriptToLLM(transcript) {
    
  //   let objectTranscript = {};

  //   if (transcript.length === 0) {
  //     return objectTranscript;
  //   }

  //   let mergedTranscript = [];
  //   let current = transcript[0];

  //   for (let i = 1; i < transcript.length; i++) {
  //     if (transcript[i].role === current.role) {
  //       current.content += '\n' + transcript[i].content;
  //     } else {
  //       mergedTranscript.push(current);
  //       current = transcript[i]
  //     }
  //   }
  //   mergedTranscript.push(current);

  //   if (mergedTranscript[0].role === 'assistant') {
  //     mergedTranscript.splice(0, 1)
  //   }

  //   let counter = 0;
  //   for (let i = 0; i < mergedTranscript.length - 1; i += 2) {
  //     // Check if [i] is role user and [i+1] is role assistant??
  //     assert(mergedTranscript[i].role === 'user');
  //     assert(mergedTranscript[i+1].role === 'assistant');

  //     if (!mergedTranscript[i].content.startsWith('/')) {
  //       objectTranscript[counter] = {
  //         question: mergedTranscript[i].content,
  //         answer: mergedTranscript[i+1].content
  //       }
  //       counter++;
  //     }
  //   }

  //   return objectTranscript;
  // }

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
        this.logger.native("[AI Condition] executing true condition");
        this.intentDir.execute(trueIntentDirective, () => {
          if (callback) {
            callback();
          }
        })
      }
      else {
        this.logger.native("[AI Condition] no block connected to true condition");
        winston.debug("DirAiPrompt No trueIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
    else {
      if (falseIntentDirective) {
        this.logger.native("[AI Condition] executing false condition");
        this.intentDir.execute(falseIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        this.logger.native("[AI Condition] no block connected to false condition");
        winston.debug("DirAiPrompt No falseIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
  }

  async #assignAttributes(action, answer) {
    winston.debug("DirAiPrompt assignAttributes action: ", action)
    winston.debug("DirAiPrompt assignAttributes answer: " + answer)

    if (this.context.tdcache) {
      if (action.assignReplyTo && answer) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignReplyTo, answer);
      }
    }
  }

  async #executeIntent(destinationIntentId, callback) {
    let intentDirective = null;
    if (destinationIntentId) {
      intentDirective = DirIntent.intentDirectiveFor(destinationIntentId, null);
    }
    if (intentDirective) {
      this.logger.native("[AI Condition] executing destinationIntentId");
      this.intentDir.execute(intentDirective, () => {
        if (callback) {
          callback();
        }
      })
    }
    else {
      this.logger.native("[AI Condition] no block connected to intentId:", destinationIntentId);
      winston.debug("[AI Condition] no block connected to intentId:" + destinationIntentId);
      if (callback) {
        callback();
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
      winston.debug("DirAiPrompt KB HttpRequest", KB_HTTPREQUEST);

      httpUtils.request(
        KB_HTTPREQUEST, async (err, resbody) => {
          if (err) {
            winston.error("(httprequest) DirAiPrompt Get KnowledgeBase err: " + err.message);
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
      winston.debug("DirAiPrompt check quote availability HttpRequest", HTTPREQUEST);

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
      winston.debug("DirAiPrompt update quote HttpRequest", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            winston.error("(httprequest) DirAiPrompt Increment tokens quote err: ", err);
            reject(false)
          } else {
            winston.debug("(httprequest) DirAiPrompt Increment token quote resbody: ", resbody);
            resolve(true);
          }
        }
      )
    })
  }

}

module.exports = { DirAiCondition }