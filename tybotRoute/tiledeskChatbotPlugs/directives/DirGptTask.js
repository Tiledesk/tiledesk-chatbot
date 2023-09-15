const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
let https = require("https");
require('dotenv').config();

class DirGptTask {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
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
    this.go(action, () => {
      callback();
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("GptTask action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirGptTask tdcache is mandatory");
      callback();
      return;
    }

    if (!action.question) {
      console.error("Error: DirGptTask question attribute is mandatory");
      callback();
      return;
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    // not necessary ?
    // const filler = new Filler();
    // const filled_question = filler.fill(action.question, requestVariables);

    let max_tokens = action.max_tokens;
    let temperature = action.temperature;

    if (this.log) {
      console.log("max_tokens: ", max_tokens);
      console.log("temperature: ", temperature);
    }

    const kb_url = process.env.API_ENDPOINT + "/" + this.context.projectId + "/kbsettings";
    if (this.log) { console.log("ApiEndpoint URL: ", kb_url); }
    const KB_HTTPREQUEST = {
      url: kb_url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'JWT ' + this.context.token
      },
      method: "GET"
    }
    if (this.log) { console.log("GptTask KB_HTTPREQUEST", KB_HTTPREQUEST); }

    this.#myrequest(
      KB_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
            console.error("(httprequest) Get KnowledgeBase err:", err);
            callback();
          }
        } else if (callback) {
          if (this.log) {
            console.log("Get KnowledgeBase resbody:", resbody);
            console.log("gptkey: ", resbody.gptkey);
          }

          let gptkey = resbody.gptkey;

          if (!gptkey) {
            console.error("Error: DirGptTask gptkey attribute is mandatory");
            callback();
          } else {

            let json = {
              "model": "gpt-3.5-turbo",
              "messages": [
                {
                  "role": "user",
                  "content": action.question
                }
              ],
              "max_tokens": action.max_tokens,
              "temperature": action.temperature
            }
            
            let message = { role: "", content: "" };
            if (action.context) {
              message.role = "system";
              message.content = action.context;
              json.messages.unshift(message);
            }

            if (this.log) { console.log("json: ", json) }

            const openai_url = process.env.OPENAI_ENDPOINT + "/chat/completions";
            if (this.log) { console.log("OpenAi endpoint URL: ", openai_url); }
            const HTTPREQUEST = {
              url: openai_url,
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + gptkey
              },
              json: json,
              method: 'POST'
            }
            if (this.log) { console.log("GptTask HTTPREQUEST: ", HTTPREQUEST); }
            this.#myrequest(
              HTTPREQUEST, async (err, resbody) => {
                if (this.log && err) {
                  console.error("(httprequest) GptTask openai err:", err.data);
                  callback();
                }
                if (this.log) { console.log("GptTask resbody: ", JSON.stringify(resbody)); }
                let answer = resbody.choices[0].message.content;
                if (this.log) { console.log("answer: ", answer);}
                await this.#assignAttributes(action, answer);

                callback();
              }
            )

          }

        }
      }
    )

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
      // if (action.assignSourceTo && source) {
      //   await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignSourceTo, source);
      // }
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
        console.error("An error occurred:", JSON.stringify(error.data));
        if (callback) {
          callback(error, null);
        }
      });
  }
}

module.exports = { DirGptTask }