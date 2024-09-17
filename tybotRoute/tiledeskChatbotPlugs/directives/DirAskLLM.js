const axios = require("axios").default;
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { Filler } = require('../Filler');
let https = require("https");
const { DirIntent } = require("./DirIntent");
const { TiledeskChatbotConst } = require("../../models/TiledeskChatbotConst");
const { TiledeskChatbotUtil } = require("../../models/TiledeskChatbotUtil");
const assert = require("assert");
require('dotenv').config();

class DirAskLLM {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
  }

  execute(directive, callback) {
    if (this.log) { console.log("AskLLM directive: ", directive); }
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("Incorrect directive: ", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("DirAskLLM action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirAskLLM tdcache is mandatory");
      callback();
      return;
    }

    let publicKey = false;
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    if (this.log) {
      console.log("DirAskLLM trueIntent", trueIntent)
      console.log("DirAskLLM falseIntent", falseIntent)
      console.log("DirAskLLM trueIntentAttributes", trueIntentAttributes)
      console.log("DirAskLLM falseIntentAttributes", falseIntentAttributes)
    }

    // default values
    let answer = "No answers";
    let namespace = this.context.projectId;
    let model = "gpt-3.5-turbo";
    let temperature;
    let max_tokens;
    let top_k;
    let transcript;
    //let default_context = "You are an helpful assistant for question-answering tasks.\nUse ONLY the following pieces of retrieved context to answer the question.\nIf you don't know the answer, just say that you don't know.\nIf none of the retrieved context answer the question, add this word to the end <NOANS>\n\n{context}";

    let contexts = {
      "gpt-3.5-turbo":        "You are an helpful assistant for question-answering tasks.\nUse ONLY the pieces of retrieved context delimited by #### to answer the question.\nIf you don't know the answer, just say: \"I don't know<NOANS>\"\n\n####{context}####",
      "gpt-4":                "You are an helpful assistant for question-answering tasks.\nUse ONLY the pieces of retrieved context delimited by #### to answer the question.\nIf you don't know the answer, just say that you don't know.\nIf and only if none of the retrieved context is useful for your task, add this word to the end <NOANS>\n\n####{context}####",
      "gpt-4-turbo-preview":  "You are an helpful assistant for question-answering tasks.\nUse ONLY the pieces of retrieved context delimited by #### to answer the question.\nIf you don't know the answer, just say that you don't know.\nIf and only if none of the retrieved context is useful for your task, add this word to the end <NOANS>\n\n####{context}####",
      "gpt-4o":               "You are an helpful assistant for question-answering tasks.\nUse ONLY the pieces of retrieved context delimited by #### to answer the question.\nIf you don't know the answer, just say that you don't know.\nIf the context does not contain sufficient information to generate an accurate and informative answer, return <NOANS>\n\n####{context}####",
      "gpt-4o-mini":          "You are an helpful assistant for question-answering tasks.\nUse ONLY the pieces of retrieved context delimited by #### to answer the question.\nIf you don't know the answer, just say that you don't know.\nIf the context does not contain sufficient information to generate an accurate and informative answer, return <NOANS>\n\n####{context}####"
    }

    let source = null;

    if (!action.question || action.question === '') {
      console.error("Error: DirAskLLM question attribute is mandatory. Executing condition false...");
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
      if (this.log) { console.log("DirAskLLM transcript string: ", transcript_string) }

      transcript = await TiledeskChatbotUtil.transcriptJSON(transcript_string);
      if (this.log) { console.log("DirAskLLM transcript ", transcript) }
    }

    const server_base_url = process.env.API_ENDPOINT || process.env.API_URL;
    const kb_endpoint = process.env.KB_ENDPOINT_QA
    
    if (this.log) {
      console.log("DirAskLLM ApiEndpoint URL: ", server_base_url);
      console.log("DirAskLLM KbEndpoint URL: ", kb_endpoint);
    }

    let key = await this.getKeyFromIntegrations(server_base_url);
    if (!key) {
      if (this.log) { console.log("DirAskLLM - Key not found in Integrations. Searching in kb settings..."); }
      key = await this.getKeyFromKbSettings(server_base_url);
    }

    if (!key) {
      if (this.log) { console.log("DirAskLLM - Retrieve public gptkey")}
      key = process.env.GPTKEY;
      publicKey = true;
    }

    if (!key) {
      console.error("Error: DirAskLLM gptkey is mandatory");
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
      let keep_going = await this.checkQuoteAvailability(server_base_url);
      if (keep_going === false) {
        if (this.log) { console.log("DirAskLLM - Quota exceeded for tokens. Skip the action")}
        callback();
        return;
      }
    }

    
    if (action.namespaceAsName) {
      // Namespace could be an attribute
      const filled_namespace = filler.fill(action.namespace, requestVariables)
      
      // namespace = await this.getNamespaceIdFromName(server_base_url, action.namespace)
      namespace = await this.getNamespaceIdFromName(server_base_url, filled_namespace);
      if (this.log) { console.log("DirAskLLM - Retrieved namespace id from name ", namespace); }
    }
    
    if (!namespace) {
      console.log("DirAskLLM - Error: namespace is undefined")
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
      model: model
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

    if (this.log) { console.log("DirAskLLM json:", json); }

    const HTTPREQUEST = {
      // url: server_base_url + "/" + this.context.projectId + "/kb/qa",
      url: kb_endpoint + "/qa",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'JWT ' + this.context.token
      },
      json: json,
      method: "POST"
    }
    if (this.log) { console.log("DirAskLLM HTTPREQUEST", HTTPREQUEST); }

    this.#myrequest(
      HTTPREQUEST, async (err, resbody) => {
        if (this.log && err) {
          console.log("DirAskLLM error: ", err);
        }
        if (this.log) { console.log("DirAskLLM resbody:", resbody); }
        let answer = resbody.answer;
        let source = resbody.source;
        await this.#assignAttributes(action, answer, source);

        if (err) {
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

          if (publicKey === true) {
            let tokens_usage = {
              tokens: resbody.prompt_token_size,
              model: json.model
            }
            this.updateQuote(server_base_url, tokens_usage);
          }

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
        if (this.log) { console.log("No trueIntentDirective specified"); }
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
        if (this.log) { console.log("No falseIntentDirective specified"); }
        if (callback) {
          callback();
        }
      }
    }
  }

  async #assignAttributes(action, answer, source) {
    if (this.log) {
      console.log("assignAttributes action:", action)
      console.log("assignAttributes answer:", answer)
      console.log("assignAttributes source:", source)
    }
    if (this.context.tdcache) {
      if (action.assignReplyTo && answer) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignReplyTo, answer);
      }
      if (action.assignSourceTo && source) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignSourceTo, source);
      }
      // Debug log
      if (this.log) {
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          if (this.log) { console.log("(askgpt) request parameter:", key, "value:", value, "type:", typeof value) }
        }
      }
    }
  }

  #myrequest(options, callback) {
    if (this.log) {
      console.log("API URL:", options.url);
      console.log("** Options:", JSON.stringify(options));
    }
    let axios_options = {
      url: options.url,
      method: options.method,
      params: options.params,
      headers: options.headers
    }
    if (options.json !== null) {
      axios_options.data = options.json
    }
    if (this.log) {
      console.log("axios_options:", JSON.stringify(axios_options));
    }
    if (options.url.startsWith("https:")) {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });
      axios_options.httpsAgent = httpsAgent;
    }
    axios(axios_options)
      .then((res) => {
        if (this.log) {
          console.log("Response for url:", options.url);
          console.log("Response headers:\n", JSON.stringify(res.headers));
        }
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
        // console.error("An error occurred:", JSON.stringify(error.data));
        if (callback) {
          callback(error, null);
        }
      });
  }

  async getKeyFromIntegrations(server_base_url) {
    return new Promise((resolve) => {

      const INTEGRATIONS_HTTPREQUEST = {
        url: server_base_url + "/" + this.context.projectId + "/integration/name/openai",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      }
      if (this.log) { console.log("DirAskLLM INTEGRATIONS_HTTPREQUEST ", INTEGRATIONS_HTTPREQUEST) }

      this.#myrequest(
        INTEGRATIONS_HTTPREQUEST, async (err, integration) => {
          if (err) {
            if (this.log) { console.error("DirAskLLM Get integrations error ", err); }
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

  async getKeyFromKbSettings(server_base_url) {
    return new Promise((resolve) => {

      const KB_HTTPREQUEST = {
        url: server_base_url + "/" + this.context.projectId + "/kbsettings",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      }
      if (this.log) { console.log("DirAskLLM KB_HTTPREQUEST", KB_HTTPREQUEST); }

      this.#myrequest(
        KB_HTTPREQUEST, async (err, resbody) => {
          if (err) {
            if (this.log) { console.error("DirAskLLM Get kb settings error ", err); }
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

  async checkQuoteAvailability(server_base_url) {
    return new Promise((resolve) => {

      const HTTPREQUEST = {
        url: server_base_url + "/" + this.context.projectId + "/quotes/tokens",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      }
      if (this.log) { console.log("DirAskLLM check quote availability HTTPREQUEST", HTTPREQUEST); }

      this.#myrequest(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            console.error("(httprequest) DirAskLLM Check quote availability err: ", err);
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

  async updateQuote(server_base_url, tokens_usage) {
    return new Promise((resolve) => {

      const HTTPREQUEST = {
        url: server_base_url + "/" + this.context.projectId + "/quotes/incr/tokens",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        json: tokens_usage,
        method: "POST"
      }
      if (this.log) { console.log("DirAskLLM check quote availability HTTPREQUEST", HTTPREQUEST); }

      this.#myrequest(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            console.error("(httprequest) DirAskLLM Increment tokens quote err: ", err);
            rejects(false)
          } else {
            console.log("(httprequest) DirAskLLM Increment token quote resbody: ", resbody);
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

  async getNamespaceIdFromName(server_base_url, name) {
    return new Promise((resolve) => {

      const HTTPREQUEST = {
        url: server_base_url + "/" + this.context.projectId + "/kb/namespace/all",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      }
      if (this.log) { console.log("DirAskLLM get all namespaces HTTPREQUEST", HTTPREQUEST); }

      this.#myrequest(
        HTTPREQUEST, async (err, namespaces) => {
          if (err) {
            console.error("(httprequest) DirAskLLM get all namespaces err: ", err);
            resolve(null)
          } else {
            if (this.log) { console.log("(httprequest) DirAskLLM get all namespaces resbody: ", namespaces); }

            let namespace = namespaces.find(n => n.name === name);
            let namespace_id = namespace.id;

            resolve(namespace_id);
          }
        }
      )
    })

  }


}

module.exports = { DirAskLLM }