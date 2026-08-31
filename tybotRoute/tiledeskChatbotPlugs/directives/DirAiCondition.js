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
const quotasService = require("../../services/QuotasService");
const { BaseDirective } = require("../BaseDirective");
const { randomUUID } = require("crypto");
const { Directives } = require('./Directives');


class DirAiCondition extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.AI_CONDITION];

  _conditionLabels = {
    trueExecute: "[AI Condition] executing true condition",
    trueMissing: "[AI Condition] no block connected to true condition",
    falseExecute: "[AI Condition] executing false condition",
    falseMissing: "[AI Condition] no block connected to false condition"
  };

  constructor(context) {
    super(context);
    this.chatbot = this.context.chatbot;

    this.intentDir = new DirIntent(context);
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
    //     "conditionIntentId": "#9b1c29c1671847dba6db561f771a142e"
    //   }
    // ]
    let fallbackIntent = action.fallbackIntent; // non condition met block
    let errorIntent = action.errorIntent; // On error block
    await this.checkMandatoryParameters(action).catch( async (missing_param) => {
      const error = "AiCondition Error: '" + missing_param + "' attribute is undefined"
      this.logger.error(error);
      await this.chatbot.addParameter("flowError", error);
      if (errorIntent) {
        await this.#executeIntent(errorIntent);
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
    const filled_model = filler.fill(action.model, requestVariables);
    
    let conditions = "";
    intents.forEach( function(intent) {
      let filled_prompt = filler.fill(intent.prompt, requestVariables);
      conditions += `- label: ${intent.label} when: ${filled_prompt}\n`
    });

    let instructions = filler.fill(action.instructions, requestVariables);
    let prompt_header = "Reply with the label satisfying the corresponding condition or with “fallback” if all conditions are false.\nIf more than one condition is true, answer with the first label corresponding to the true condition, following the order from top to bottom."
    let condition_prompt = TiledeskChatbotUtil.AiConditionPromptBuilder(prompt_header, intents, instructions)

    // let raw_condition_prompt = `Reply with the label satisfying the corresponding condition or with “fallback” if all conditions are false.
    // If more than one condition is true, answer with the first label corresponding to the true condition, following the order from top to bottom.
    // ${conditions}
    // ${instructions}`
    
    // const filled_question = condition_prompt; //filler.fill(action.question, requestVariables);
    const filled_context = filler.fill(action.context, requestVariables);

    // evaluate

    let AI_endpoint = process.env.KB_ENDPOINT_QA;
    winston.verbose("DirAiCondition AI_endpoint " + AI_endpoint);

    let headers = {
      'Content-Type': 'application/json'
    }
    
    let answer = "";
    let key;
    let publicKey = false;
    let ollama_integration;
    let vllm_server_config;

    if (action.llm === 'ollama') {
      ollama_integration = await integrationService.getIntegration(this.projectId, action.llm, this.token).catch( async (err) => {
        this.logger.error("[AI Condition] Error getting ollama integration.")
        winston.error("DirAiCondition Error getting ollama integration: ", err);
        await this.chatbot.addParameter("flowError", "Ollama integration not found");
        if (errorIntent) {
          await this.#executeIntent(errorIntent);
          callback(true);
          return;
        }
        callback();
        return;
      });

    } else if(action.llm === 'vllm'){
      const vllm_integration = await integrationService.getIntegration(this.projectId, action.llm, this.token);
      
      if (!vllm_integration?.value) {
        this.logger.error("[AI Condition] Error getting vllm integration.");
        winston.error("DirAiCondition Error getting vllm integration");
        await this.chatbot.addParameter("flowError", "Vllm integration not found");
        if (falseIntent) {
          await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      }

      const vllm_value = vllm_integration.value;
      if (Array.isArray(vllm_value.servers)) {
        const filled_vllm_server = filler.fill(action.vllmServer, requestVariables);
        if (!filled_vllm_server) {
          this.logger.error("[AI Condition] missing vllmServer for multi-server vllm integration");
          await this.chatbot.addParameter("flowError", "AiCondition Error: 'vllmServer' attribute is undefined");
          if (falseIntent) {
            await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        }
        vllm_server_config = vllm_value.servers.find(s => s.name === filled_vllm_server);
        if (!vllm_server_config) {
          this.logger.error("[AI Condition] vllm server not found: ", filled_vllm_server);
          await this.chatbot.addParameter("flowError", "AiCondition Error: vllm server '" + filled_vllm_server + "' not found");
          if (falseIntent) {
            await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        }
        key = vllm_server_config.apikey;
      } else {
        key = vllm_value.apikey;
      }

      if (!key) {
        this.logger.error("[AI Condition] llm key not found in vllm integration");
        winston.error("Error: DirAiCondition llm key not found in vllm integration");
        await this.chatbot.addParameter("flowError", "AiCondition Error: missing key for llm vllm");
        if (falseIntent) {
          await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      }

    } else {
      key = await integrationService.getKeyFromIntegrations(this.projectId, action.llm, this.token);
  
      if (!key && action.llm === "openai") {
        this.logger.native("[AI Condition] Using shared OpenAI key.")
        key = process.env.GPTKEY;
        publicKey = true;
      }

      if (!key) {
        this.logger.error("[AI Condition] llm key not found");
        winston.error("Error: DirAiCondition llm key not found");
        await this.chatbot.addParameter("flowError", "AiCondition Error: missing key for llm " + action.llm);
        if (errorIntent) {
          await this.#executeIntent(errorIntent);
          callback(true);
          return;
        }
        callback();
        return;
      }
    }

    if (publicKey === true) {
      try {
        let keep_going = await quotasService.checkQuoteAvailability(this.projectId, this.token)
        if (keep_going === false) {
          this.logger.warn("[AI Condition] OpenAI tokens quota exceeded");
          await this.chatbot.addParameter("flowError", "GPT Error: tokens quota exceeded");
          if (errorIntent) {
            await this.#executeIntent(errorIntent);
            callback();
            return;
          }
          callback();
          return;
        }
      } catch (err) {
        this.logger.error("An error occured on checking token quota availability");
        await this.chatbot.addParameter("flowError", "An error occured on checking token quota availability");
        if (errorIntent) {
          await this.#executeIntent(errorIntent);
          callback();
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
      max_tokens: action.max_tokens,
      id_project: this.projectId,
      request_id: this.requestId,
      agent_id: this.chatbot?.bot.root_id || null
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

    if (action.llm === 'vllm' && vllm_server_config) {
      console.log("llm: vllm")
      json.model = {
        name: filled_model,
        url: vllm_server_config.url,
        api_key: vllm_server_config.apikey || vllm_server_config.token || null,
        provider: 'vllm'
      }
      console.log("set json.model to: ", json.model);
    }

    winston.debug("DirAiCondition json: ", json);

    const HTTPREQUEST = {
      url: AI_endpoint + "/ask",
      headers: headers,
      json: json,
      method: 'POST'
    }
    winston.debug("DirAiCondition HttpRequest: ", HTTPREQUEST);

    httpUtils.request(
      HTTPREQUEST, async (err, resbody) => {
        if (err) {
          winston.error("DirAiCondition openai err: ", err);
          await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);
          let error;
          if (err.response?.data?.detail[0]) {
            error = err.response.data.detail[0]?.msg;
          } else if (err.response?.data?.detail?.answer) {
            error = err.response.data.detail.answer;
          } else {
            error = JSON.stringify(err.response.data);
          }
          this.logger.error("[AI Condition] error executing action: ", error);
          if (errorIntent) {
            await this.chatbot.addParameter("flowError", "[AI Condition] error executing action: condition label not found in intents list");
            await this.#executeIntent(errorIntent);
            callback(true);
            return;
          }
          callback();
          return;
        } else {

          winston.debug("DirAiCondition resbody: ", resbody);
          answer = resbody.answer;
          this.logger.native("[AI Condition] answer: ", answer);

          // if (publicKey === true) {
          //   let tokens_usage = {
          //     tokens: resbody.usage.total_token,
          //     model: json.model
          //   }
          //   quotasService.updateQuote(this.projectId, this.token, tokens_usage);
          // }
        
          await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);

          if (answer === "fallback") {
            if (fallbackIntent) {
              await this.#executeIntent(fallbackIntent) 
              if (callback) {
                callback(true);
                return;
              }
            }
          }
          else {
            let answer_found = null;
            intents.forEach( i => {
              if (i.label === answer) {
                answer_found = i;
              }
            });
            if (answer_found) {
              await this.#executeIntent(answer_found.conditionIntentId) 
              if (callback) {
                callback(true);
                return;
              }
            }
            else { // if (answer === "fallback") {
              if (fallbackIntent) {
                await this.#executeIntent(fallbackIntent) 
                if (callback) {
                  callback(true);
                  return;
                }
              }
              else {
                this.logger.error("[AI Condition] Fallback connector not found");
              }
            }
          }
          this.logger.error("[AI Condition] error executing action: condition label not found in intents list");
          callback();
          return;
        }
      }
    )
  }

  async checkMandatoryParameters(action) {
    return new Promise((resolve, reject) => {
      let params = ['llm', 'model']; // mandatory params
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

}

module.exports = { DirAiCondition }
