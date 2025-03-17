const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
let https = require("https");
const { DirIntent } = require("./DirIntent");
const { TiledeskChatbotConst } = require("../../models/TiledeskChatbotConst");
const { TiledeskChatbotUtil } = require("../../models/TiledeskChatbotUtil");
require('dotenv').config();
const winston = require('../../utils/winston');


class DirAiPrompt {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.chatbot = this.context.chatbot;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.intentDir = new DirIntent(context);
    this.API_ENDPOINT = this.context.API_ENDPOINT;
    this.log = context.log;
  }

  execute(directive, callback) {
    winston.verbose("Execute AiPrompt directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.debug("DirAiPrompt Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("DirAiPrompt action:", action);
    if (!this.tdcache) {
      winston.error("Error: DirAiPrompt tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;
    let transcript;
    let answer = "No answer"

    winston.debug("DirAskGPTV2 trueIntent", trueIntent)
    winston.debug("DirAskGPTV2 falseIntent", falseIntent)

    await this.checkMandatoryParameters(action).catch( async (missing_param) => {
      await this.chatbot.addParameter("flowError", "AiPrompt Error: '" + missing_param + "' attribute is undefined");
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return Promise.reject();
      }
      callback();
      return Promise.reject();
    })

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    const filler = new Filler();
    const filled_question = filler.fill(action.question, requestVariables);
    const filled_context = filler.fill(action.context, requestVariables);

    if (action.history) {
      let transcript_string = await TiledeskChatbot.getParameterStatic(
        this.context.tdcache,
        this.context.requestId,
        TiledeskChatbotConst.REQ_TRANSCRIPT_KEY);
        winston.debug("DirAiPrompt transcript string: " + transcript_string)

      if (transcript_string) {
        transcript = await TiledeskChatbotUtil.transcriptJSON(transcript_string);
        winston.debug("DirAiPrompt transcript: ", transcript)
      } else {
        winston.verbose("DirAiPrompt transcript_string is undefined. Skip JSON translation for chat history")
      }
    }

    const AI_endpoint = process.env.AI_ENDPOINT
    winston.verbose("DirAiPrompt AI_endpoint " + AI_endpoint);

    let key = await this.getKeyFromIntegrations(action.llm);

    if (!key) {
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

    let json = {
      question: filled_question,
      llm: action.llm,
      model: action.model,
      llm_key: key,
      temperature: action.temperature,
      max_tokens: action.max_tokens
    }

    if (action.context) {
      json.system_context = filled_context;
    }
    if (transcript) {
      json.chat_history_dict = await this.transcriptToLLM(transcript);
    }

    winston.debug("DirAiPrompt json: ", json);

    const HTTPREQUEST = {
      url: AI_endpoint + '/ask',
      headers: {
        'Content-Type': 'application/json'
      },
      json: json,
      method: 'POST'
    }
    winston.debug("DirAiPrompt HttpRequest: ", HTTPREQUEST);

    this.#myrequest(
      HTTPREQUEST, async (err, resbody) => {
        if (err) {
          winston.error("DirAiPrompt openai err:", err.response.data);
          await this.#assignAttributes(action, answer);
          let error;
          if (err.response?.data?.detail[0]) {
            error = err.response.data.detail[0]?.msg;
          } else if (err.response?.data?.detail?.answer) {
            error = err.response.data.detail.answer;
          } else {
            error = JSON.stringify(err.response.data);
          }
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
        
          await this.#assignAttributes(action, answer);

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
  async transcriptToLLM(transcript) {
    
    let objectTranscript = {};

    if (transcript.length === 0) {
      return objectTranscript;
    }

    let mergedTranscript = [];
    let current = transcript[0];

    for (let i = 1; i < transcript.length; i++) {
      if (transcript[i].role === current.role) {
        current.content += '\n' + transcript[i].content;
      } else {
        mergedTranscript.push(current);
        current = transcript[i]
      }
    }
    mergedTranscript.push(current);

    if (mergedTranscript[0].role === 'assistant') {
      mergedTranscript.splice(0, 1)
    }

    let counter = 0;
    for (let i = 0; i < mergedTranscript.length - 1; i += 2) {
      // Check if [i] is role user and [i+1] is role assistant??
      assert(mergedTranscript[i].role === 'user');
      assert(mergedTranscript[i+1].role === 'assistant');

      if (!mergedTranscript[i].content.startsWith('/')) {
        objectTranscript[counter] = {
          question: mergedTranscript[i].content,
          answer: mergedTranscript[i+1].content
        }
        counter++;
      }
    }

    return objectTranscript;
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
        winston.debug("DirAiPrompt No trueIntentDirective specified");
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

  #myrequest(options, callback) {
    let axios_options = {
      url: options.url,
      method: options.method,
      params: options.params,
      headers: options.headers
    }
    if (options.json !== null) {
      axios_options.data = options.json
    }
    if (options.url.startsWith("https:")) {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });
      axios_options.httpsAgent = httpsAgent;
    }
    axios(axios_options)
      .then((res) => {
        if (res && res.status == 200 && res.data) {
          if (callback) {
            callback(null, res.data);
          }
        }
        else {
          if (callback) {
            callback(new Error("Response status is not 200"), null);
          }
        }
      })
      .catch((error) => {
        winston.error("(DirAiPrompt) Axios error: ", error);
        if (callback) {
          callback(error, null);
        }
      });
  }

  async getKeyFromIntegrations(model) {
    return new Promise((resolve) => {

      const INTEGRATIONS_HTTPREQUEST = {
        url: this.API_ENDPOINT + "/" + this.context.projectId + "/integration/name/" +  model,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      }
      winston.debug("DirAiPrompt Integration HttpRequest: ", INTEGRATIONS_HTTPREQUEST)

      this.#myrequest(
        INTEGRATIONS_HTTPREQUEST, async (err, integration) => {
          if (err) {
            resolve(null);
          } else {

            if (integration &&
              integration.value) {
              resolve(integration.value.apikey)
            }
            else {
              resolve(null)
            }
          }
        })
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
      winston.debug("DirAiPrompt KB HttpRequest", KB_HTTPREQUEST);

      this.#myrequest(
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

      this.#myrequest(
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

      this.#myrequest(
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

module.exports = { DirAiPrompt }