const axios = require("axios").default;
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');
let https = require("https");
const { DirIntent } = require("./DirIntent");
const { TiledeskChatbotConst } = require("../../engine/TiledeskChatbotConst");
const { TiledeskChatbotUtil } = require("../../utils/TiledeskChatbotUtil");
const assert = require("assert");
require('dotenv').config();
const winston = require('../../utils/winston');
const httpUtils = require("../../utils/HttpUtils");
const integrationService = require("../../services/IntegrationService");

class DirAskGPTV2 {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.projectId = this.context.projectId;
    this.token = this.context.token;
    this.intentDir = new DirIntent(context);
    this.API_ENDPOINT = this.context.API_ENDPOINT;
    this.log = context.log;
  }

  execute(directive, callback) {
    winston.debug("DirAskGPTV2 directive: ", directive);
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.debug("DirAskGPTV2 Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("DirAskGPTV2 action:", action);
    if (!this.tdcache) {
      winston.error("DirAskGPTV2 Error: tdcache is mandatory");
      callback();
      return;
    }

    let publicKey = false;
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    winston.debug("DirAskGPTV2 trueIntent", trueIntent)
    winston.debug("DirAskGPTV2 falseIntent", falseIntent)
    winston.debug("DirAskGPTV2 trueIntentAttributes", trueIntentAttributes)
    winston.debug("DirAskGPTV2 falseIntentAttributes", falseIntentAttributes)
  

    // default values
    let answer = "No answers";
    let namespace = this.context.projectId;
    let model = "gpt-3.5-turbo";
    let temperature;
    let max_tokens;
    let top_k;
    let transcript;
    let citations = false;
    let engine;
    //let default_context = "You are an helpful assistant for question-answering tasks.\nUse ONLY the following pieces of retrieved context to answer the question.\nIf you don't know the answer, just say that you don't know.\nIf none of the retrieved context answer the question, add this word to the end <NOANS>\n\n{context}";

    let contexts = {
      "gpt-3.5-turbo":        "You are an helpful assistant for question-answering tasks.\nUse ONLY the pieces of retrieved context delimited by #### to answer the question.\nIf you don't know the answer, just say: \"I don't know<NOANS>\"\n\n####{context}####",
      "gpt-4":                "You are an helpful assistant for question-answering tasks.\nUse ONLY the pieces of retrieved context delimited by #### to answer the question.\nIf you don't know the answer, just say that you don't know.\nIf and only if none of the retrieved context is useful for your task, add this word to the end <NOANS>\n\n####{context}####",
      "gpt-4-turbo-preview":  "You are an helpful assistant for question-answering tasks.\nUse ONLY the pieces of retrieved context delimited by #### to answer the question.\nIf you don't know the answer, just say that you don't know.\nIf and only if none of the retrieved context is useful for your task, add this word to the end <NOANS>\n\n####{context}####",
      "gpt-4o":               "You are an helpful assistant for question-answering tasks. Follow these steps carefully:\n1. Answer in the same language of the user question, regardless of the retrieved context language\n2. Use ONLY the pieces of the retrieved context to answer the question.\n3. If the retrieved context does not contain sufficient information to generate an accurate and informative answer, return <NOANS>\n\n==Retrieved context start==\n{context}\n==Retrieved context end==",
      "gpt-4o-mini":          "You are an helpful assistant for question-answering tasks. Follow these steps carefully:\n1. Answer in the same language of the user question, regardless of the retrieved context language\n2. Use ONLY the pieces of the retrieved context to answer the question.\n3. If the retrieved context does not contain sufficient information to generate an accurate and informative answer, return <NOANS>\n\n==Retrieved context start==\n{context}\n==Retrieved context end==",
      "gpt-4.1":              "You are an helpful assistant for question-answering tasks. Follow these steps carefully:\n1. Answer in the same language of the user question, regardless of the retrieved context language\n2. Use ONLY the pieces of the retrieved context to answer the question.\n3. If the retrieved context does not contain sufficient information to generate an accurate and informative answer, return <NOANS>\n\n==Retrieved context start==\n{context}\n==Retrieved context end==",
      "gpt-4.1-mini":         "You are an helpful assistant for question-answering tasks. Follow these steps carefully:\n1. Answer in the same language of the user question, regardless of the retrieved context language\n2. Use ONLY the pieces of the retrieved context to answer the question.\n3. If the retrieved context does not contain sufficient information to generate an accurate and informative answer, return <NOANS>\n\n==Retrieved context start==\n{context}\n==Retrieved context end==",
      "gpt-4.1-nano":         "You are an helpful assistant for question-answering tasks. Follow these steps carefully:\n1. Answer in the same language of the user question, regardless of the retrieved context language\n2. Use ONLY the pieces of the retrieved context to answer the question.\n3. If the retrieved context does not contain sufficient information to generate an accurate and informative answer, return <NOANS>\n\n==Retrieved context start==\n{context}\n==Retrieved context end=="
    }

    let source = null;

    if (!action.question || action.question === '') {
      winston.error("DirAskGPTV2 Error: question attribute is mandatory. Executing condition false...");
      await this.#assignAttributes(action, answer, source);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
      }
      callback(true);
      return;
    }

    if (action.namespace) {
      namespace = action.namespace;
    }
    if (action.model) {
      model = action.model;
    }

    if (action.top_k) {
      top_k = action.top_k;
    }

    if (action.temperature) {
      temperature = action.temperature;
    }

    if (action.max_tokens) {
      max_tokens = action.max_tokens;
    }

    if (action.citations) {
      citations = action.citations;
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );

    const filler = new Filler();
    const filled_question = filler.fill(action.question, requestVariables);
    const filled_context = filler.fill(action.context, requestVariables)

    if (action.history) {
      let transcript_string = await TiledeskChatbot.getParameterStatic(
        this.context.tdcache,
        this.context.requestId,
        TiledeskChatbotConst.REQ_TRANSCRIPT_KEY
      )
      winston.debug("DirAskGPTV2 transcript string: " + transcript_string)

      if (transcript_string) {
        transcript = await TiledeskChatbotUtil.transcriptJSON(transcript_string);
        winston.debug("DirAskGPTV2 transcript ", transcript)
      } else {
        winston.verbose("DirAskGPT transcript_string is undefined. Skip JSON translation for chat history")
      }
    }

    const kb_endpoint = process.env.KB_ENDPOINT_QA
    winston.verbose("DirAskGPTV2  KbEndpoint URL: " + kb_endpoint);

    let key = await integrationService.getKeyFromIntegrations(this.projectId, 'openai', this.token);
    if (!key) {
      winston.verbose("DirAskGPTV2 - Key not found in Integrations. Searching in kb settings...");
      key = await this.getKeyFromKbSettings();
    }

    if (!key) {
      winston.verbose("DirAskGPTV2 - Retrieve public gptkey")
      key = process.env.GPTKEY;
      publicKey = true;
    }

    if (!key) {
      winston.info("DirAskGPTV2 Error: gptkey is mandatory");
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
        winston.verbose("DirAskGPTV2 - Quota exceeded for tokens. Skip the action")
        await this.chatbot.addParameter("flowError", "AskGPT Error: tokens quota exceeded");
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);  
        return;
      }
    }

    let ns;

    if (action.namespaceAsName) {
      // Namespace could be an attribute
      const filled_namespace = filler.fill(action.namespace, requestVariables)
      ns = await this.getNamespace(filled_namespace, null);
      namespace = ns?.id;
      winston.verbose("DirAskGPTV2 - Retrieved namespace id from name " + namespace);
    } else {
      ns = await this.getNamespace(null, namespace);
    }

    if (!ns) {
      await this.#assignAttributes(action, answer);
      await this.chatbot.addParameter("flowError", "AskGPT Error: namespace not found");
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    if (ns.engine) {
      engine = ns.engine;
    } else {
      engine = await this.setDefaultEngine()
    }
    
    if (!namespace) {
      winston.verbose("DirAskGPTV2 - Error: namespace is undefined")
      if (falseIntent) {
        await this.chatbot.addParameter("flowError", "AskGPT Error: namespace is undefined");
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
    }

    let json = {
      question: filled_question,
      gptkey: key,
      namespace: namespace,
      model: model,
      citations: citations,
      engine: engine
    };
    if (top_k) {
      json.top_k = top_k;
    }
    if (temperature) {
      json.temperature = temperature;
    }
    if (max_tokens) {
      json.max_tokens = max_tokens;
    }
    
    if (!action.advancedPrompt) {
      if (filled_context) {
        json.system_context = filled_context + "\n" + contexts[model];
      } else {
        json.system_context = contexts[model];
      }
    } else {
      json.system_context = filled_context;
    }

    if (transcript) {
      json.chat_history_dict = await this.transcriptToLLM(transcript);
    }

    winston.debug("DirAskGPTV2 json:", json);

    const HTTPREQUEST = {
      url: kb_endpoint + "/qa",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'JWT ' + this.context.token
      },
      json: json,
      method: "POST"
    }
    winston.debug("DirAskGPTV2 HttpRequest: ", HTTPREQUEST);

    httpUtils.request(
      HTTPREQUEST, async (err, resbody) => {
        
        if (err) {
          winston.error("DirAskGPTV2 error: ", err?.respose);
          await this.#assignAttributes(action, answer, source);
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
          winston.debug("DirAskGPTV2 resbody: ", resbody);
          await this.#assignAttributes(action, resbody.answer, resbody.source);
          if (publicKey === true) {
            let tokens_usage = {
              tokens: resbody.prompt_token_size,
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
        } else {
          await this.#assignAttributes(action, answer, source);
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
        winston.debug("DirAskGPTV2 No trueIntentDirective specified");
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
        winston.debug("DirAskGPTV2 No falseIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
  }

  async #assignAttributes(action, answer, source) {
    winston.debug("DirAskGPTV2assignAttributes action: ", action)
    winston.debug("DirAskGPTV2assignAttributes answer: ", answer)
    winston.debug("DirAskGPTV2assignAttributes source: ", source)
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
      winston.debug("DirAskGPTV2 KB HttpRequest", KB_HTTPREQUEST);

      httpUtils.request(
        KB_HTTPREQUEST, async (err, resbody) => {
          if (err) {
            winston.error("DirAskGPTV2 Get kb settings error ", err?.response?.data);
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
      winston.debug("DirAskGPTV2 check quote availability HttpRequest", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            winston.error("DirAskGPTV2 Check quote availability err: ", err);
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
      winston.debug("DirAskGPTV2 update quote HttpRequest ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            winston.error("DirAskGPTV2 Increment tokens quote err: ", err);
            reject(false)
          } else {
            resolve(true);
          }
        }
      )
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

  async getNamespace(name, id) {
    return new Promise((resolve) => {
      const HTTPREQUEST = {
        url: this.API_ENDPOINT + "/" + this.context.projectId + "/kb/namespace/all",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      }
      winston.debug("DirAskGPTV2 get all namespaces HttpRequest", HTTPREQUEST);
      httpUtils.request(
        HTTPREQUEST, async (err, namespaces) => {
          if (err) {
            winston.error("DirAskGPTV2 get all namespaces err: ", err);
            resolve(null)
          } else {
            winston.debug("DirAskGPTV2 get all namespaces resbody: ", namespaces);
            if (name) {
              let namespace = namespaces.find(n => n.name === name);
              resolve(namespace);
            } else {
              let namespace = namespaces.find(n => n.id === id);
              resolve(namespace);
            }

          }
        }
      )
    })
  }

  async setDefaultEngine() {
    return new Promise((resolve) => {
      let engine = {
        name: "pinecone",
        type: process.env.PINECONE_TYPE,
        apikey: "",
        vector_size: 1536,
        index_name: process.env.PINECONE_INDEX
      }
      resolve(engine);
    })
  }

}

module.exports = { DirAskGPTV2 }