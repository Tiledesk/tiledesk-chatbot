const axios = require("axios").default;
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { Filler } = require('../Filler');
let https = require("https");
const { DirIntent } = require("./DirIntent");
require('dotenv').config();

class DirAskGPTV2 {

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
    if (this.log) { console.log("AskGPT directive: ", directive); }
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
    if (this.log) { console.log("DirAskGPT action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirAskGPT tdcache is mandatory");
      callback();
      return;
    }

    let publicKey = false;
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    if (this.log) {
      console.log("DirAskGPT trueIntent", trueIntent)
      console.log("DirAskGPT falseIntent", falseIntent)
      console.log("DirAskGPT trueIntentAttributes", trueIntentAttributes)
      console.log("DirAskGPT falseIntentAttributes", falseIntentAttributes)
    }

    // default values
    let answer = "No answers";
    let source = null;
    let model = "gpt-3.5-turbo";
    let temperature;
    let max_tokens;
    let top_k;

    if (!action.question || action.question === '') {
      console.error("Error: DirAskGPT question attribute is mandatory. Executing condition false...");
      await this.#assignAttributes(action, answer, source);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
      }
      callback(true);
      return;
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

    const server_base_url = process.env.API_ENDPOINT || process.env.API_URL;
    const kb_endpoint = process.env.KB_ENDPOINT_QA
    
    if (this.log) {
      console.log("DirAskGPT ApiEndpoint URL: ", server_base_url);
      console.log("DirAskGPT KbEndpoint URL: ", kb_endpoint);
    }

    let key = await this.getKeyFromIntegrations(server_base_url);
    if (!key) {
      if (this.log) { console.log("DirAskGPT - Key not found in Integrations. Searching in kb settings..."); }
      key = await this.getKeyFromKbSettings(server_base_url);
    }

    if (!key) {
      if (this.log) { console.log("DirAskGPT - Retrieve public gptkey")}
      key = process.env.GPTKEY;
      publicKey = true;
    }

    if (!key) {
      console.error("Error: DirAskGPT gptkey is mandatory");
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
        if (this.log) { console.log("DirAskGPT - Quota exceeded for tokens. Skip the action")}
        callback();
        return;
      }
    }

    let json = {
      question: filled_question,
      gptkey: key,
      namespace: this.context.projectId,
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
    if (filled_context) {
      json.context = filled_context;
    }
    if (this.log) { console.log("DirAskGPT json:", json); }

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
    if (this.log) { console.log("DirAskGPT HTTPREQUEST", HTTPREQUEST); }

    this.#myrequest(
      HTTPREQUEST, async (err, resbody) => {
        if (this.log && err) {
          console.log("DirAskGPT error: ", err);
        }
        if (this.log) { console.log("DirAskGPT resbody:", resbody); }
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
      if (this.log) { console.log("DirAskGPT INTEGRATIONS_HTTPREQUEST ", INTEGRATIONS_HTTPREQUEST) }

      this.#myrequest(
        INTEGRATIONS_HTTPREQUEST, async (err, integration) => {
          if (err) {
            if (this.log) { console.error("DirAskGPT Get integrations error ", err); }
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
      if (this.log) { console.log("DirAskGPT KB_HTTPREQUEST", KB_HTTPREQUEST); }

      this.#myrequest(
        KB_HTTPREQUEST, async (err, resbody) => {
          if (err) {
            if (this.log) { console.error("DirAskGPT Get kb settings error ", err); }
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
      if (this.log) { console.log("DirAskGPT check quote availability HTTPREQUEST", HTTPREQUEST); }

      this.#myrequest(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            console.error("(httprequest) DirAskGPT Check quote availability err: ", err);
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
      if (this.log) { console.log("DirAskGPT check quote availability HTTPREQUEST", HTTPREQUEST); }

      this.#myrequest(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            console.error("(httprequest) DirAskGPT Increment tokens quote err: ", err);
            rejects(false)
          } else {
            console.log("(httprequest) DirAskGPT Increment token quote resbody: ", resbody);
            resolve(true);
          }
        }
      )
    })
  }


}

module.exports = { DirAskGPTV2 }