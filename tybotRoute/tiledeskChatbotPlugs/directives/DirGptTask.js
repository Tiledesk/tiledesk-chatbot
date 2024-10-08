const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
let https = require("https");
const { DirIntent } = require("./DirIntent");
const { TiledeskChatbotConst } = require("../../models/TiledeskChatbotConst");
const { TiledeskChatbotUtil } = require("../../models/TiledeskChatbotUtil");
require('dotenv').config();

class DirGptTask {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.chatbot = this.context.chatbot;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
  }

  execute(directive, callback) {
    if (this.log) { console.log("GptTask directive: ", directive); }
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
    if (this.log) { console.log("DirGptTask action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirGptTask tdcache is mandatory");
      callback();
      return;
    }

    let publicKey = false;
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;
    let transcript;

    if (this.log) {
      console.log("DirGptTask trueIntent", trueIntent)
      console.log("DirGptTask falseIntent", falseIntent)
      console.log("DirGptTask trueIntentAttributes", trueIntentAttributes)
      console.log("DirGptTask falseIntentAttributes", falseIntentAttributes)
    }

    // default value
    let answer = "No answer.";
    let model = "gpt-3.5-turbo";

    if (!action.question || action.question === '') {
      console.error("Error: DirGptTask question attribute is mandatory. Executing condition false...")
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

    if (this.log) {
      console.log("DirGptTask max_tokens: ", max_tokens);
      console.log("DirGptTask temperature: ", temperature);
    }

    if (action.history) {
      let transcript_string = await TiledeskChatbot.getParameterStatic(
        this.context.tdcache,
        this.context.requestId,
        TiledeskChatbotConst.REQ_TRANSCRIPT_KEY);
      if (this.log) { console.log("DirGptTask transcript string: ", transcript_string) }

      transcript = await TiledeskChatbotUtil.transcriptJSON(transcript_string);
      if (this.log) { console.log("DirGptTask transcript: ", transcript) }
    }


    const server_base_url = process.env.API_ENDPOINT || process.env.API_URL;
    const openai_url = process.env.OPENAI_ENDPOINT + "/chat/completions";
    if (this.log) {
      console.log("DirGptTask server_base_url ", server_base_url);
      console.log("DirGptTask openai_url ", openai_url);
    }

    let key = await this.getKeyFromIntegrations(server_base_url);
    if (!key) {
      if (this.log) { console.log("DirGptTask - Key not found in Integrations. Searching in kb settings..."); }
      key = await this.getKeyFromKbSettings(server_base_url);
    }

    if (!key) {
      if (this.log) { console.log("DirGptTask - Retrieve public gptkey")}
      key = process.env.GPTKEY;
      publicKey = true;
    }

    if (!key) {
      console.error("DirGptTask gptkey is mandatory");
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
      let keep_going = await this.checkQuoteAvailability(server_base_url);
      if (keep_going === false) {
        if (this.log) { console.log("DirGptTask - Quota exceeded for tokens. Skip the action")}
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
    
    if (this.log) { console.log("DirGptTask json: ", json) }

    const HTTPREQUEST = {
      url: openai_url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      json: json,
      method: 'POST'
    }
    if (this.log) { console.log("DirGptTask HTTPREQUEST: ", HTTPREQUEST); }
    this.#myrequest(
      HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (this.log) {
            console.error("(httprequest) DirGptTask openai err:", err);
            console.error("(httprequest) DirGptTask openai err:", err.response?.data?.error?.message);
          }
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
          if (this.log) { console.log("DirGptTask resbody: ", JSON.stringify(resbody)); }
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
            this.updateQuote(server_base_url, tokens_usage);
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

  async #assignAttributes(action, answer) {
    if (this.log) {
      console.log("assignAttributes action:", action)
      console.log("assignAttributes answer:", answer)
    }
    if (this.context.tdcache) {
      if (action.assignReplyTo && answer) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignReplyTo, answer);
      }
      // Debug log
      if (this.log) {
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          if (this.log) { console.log("(gpttask) request parameter:", key, "value:", value, "type:", typeof value) }
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
      if (this.log) { console.log("DirGptTask INTEGRATIONS_HTTPREQUEST ", INTEGRATIONS_HTTPREQUEST) }

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
      if (this.log) { console.log("DirGptTask KB_HTTPREQUEST", KB_HTTPREQUEST); }

      this.#myrequest(
        KB_HTTPREQUEST, async (err, resbody) => {
          if (err) {
            console.error("(httprequest) DirGptTask Get KnowledgeBase err:", err.message);
            if (this.log) {
              console.error("(httprequest) DirGptTask Get KnowledgeBase full err", err);
            }
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
      if (this.log) { console.log("DirGptTask check quote availability HTTPREQUEST", HTTPREQUEST); }

      this.#myrequest(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            console.error("(httprequest) DirGptTask Check quote availability err: ", err);
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
      if (this.log) { console.log("DirGptTask check quote availability HTTPREQUEST", HTTPREQUEST); }

      this.#myrequest(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            console.error("(httprequest) DirGptTask Increment tokens quote err: ", err);
            rejects(false)
          } else {
            if (this.log) { console.log("(httprequest) DirGptTask Increment token quote resbody: ", resbody); }
            resolve(true);
          }
        }
      )
    })
  }

}

module.exports = { DirGptTask }