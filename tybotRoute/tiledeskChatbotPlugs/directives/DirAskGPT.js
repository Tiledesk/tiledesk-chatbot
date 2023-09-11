const axios = require("axios").default;
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { Filler } = require('../Filler');
let https = require("https");
const { DirIntent } = require("./DirIntent");
require('dotenv').config();

class DirAskGPT {

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
    this.go(action, () => {
      callback();
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("AskGPT action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirAskGPT tdcache is mandatory");
      callback();
      return;
    }

    if (!action.question) {
      console.error("Error: DirAskGPT questionAttribute is mandatory");
      callback();
      return;
    }

    if (!action.kbid) {
      console.error("Error: DirAskGPT kbid is mandatory");
      callback();
      return;
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );

    const filler = new Filler();
    const filled_question = filler.fill(action.question, requestVariables);

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    if (this.log) {
      console.log("trueIntent",trueIntent )
      console.log("falseIntent",falseIntent )
      console.log("trueIntentAttributes",trueIntentAttributes )
      console.log("falseIntentAttributes",falseIntentAttributes )
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
    if (this.log) { console.log("AskGPT KB_HTTPREQUEST", KB_HTTPREQUEST); }

    this.myrequest(
      KB_HTTPREQUEST, async (err, resbody) => {
        if (this.log) { console.log("AskGPT resbody:", resbody); }
        if (err) {
          if (this.log) { console.error("AskGPT error:", err); }
          if (callback) {
            let answer = "No answers";
            let source = null;
            await this.#assignAttributes(action, answer, source);
            this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
              callback(false); // continue the flow
            });
          }
        } else if (callback) {
          if (this.log) {
            console.log("resbody", resbody);
            console.log("gptkey", resbody.gptkey);
          }

          if (!resbody.gptkey) {
            let answer = "No answers";
            let source = "no source";
            await this.#assignAttributes(action, answer, source);
            this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
              callback(false); // continue the flow
            });
          } else {
            let json = {
              "question": filled_question,
              "kbid": action.kbid,
              "gptkey": resbody.gptkey
            };
            if (this.log) {console.log("question_gpt:", json);}

            const url = process.env.GPT_ENDPOINT; //"https://tiledesk-playground.azurewebsites.net/api/qa"; // TODO INSERIRE IN ENV
            if (this.log) {console.log("DirAskGPT URL", url);}
            const HTTPREQUEST = {
              url: url,
              json: json,
              method: "POST"
            }
            if (this.log) {console.log("AskGPT HTTPREQUEST", HTTPREQUEST);}
            this.myrequest(
              HTTPREQUEST, async (err, resbody) => {
                if (this.log && err) {
                  console.log("AskGPT error: ", err);
                }
                if (this.log) {console.log("AskGPT resbody:", resbody);}
                let answer = resbody.answer;
                let source = resbody.source_url;
                await this.#assignAttributes(action, answer, source);

                if (err) {
                  if (callback) {
                    this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
                      callback(false); // continue the flow
                    });
                  }
                } 
                else if (resbody.success === true) {
                  
                  await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
                    callback(); // stop the flow
                  })
                } else { //resbody.success === false
                  await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
                    callback(false); // stop the flow
                  })
                }
              }
            )
          }
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
          callback();
        })
      }
      else {
        if (this.log) { console.log("No trueIntentDirective specified"); }
        callback();
      }
    }
    else {
      if (falseIntentDirective) {
        this.intentDir.execute(falseIntentDirective, () => {
          callback();
        });
      }
      else {
        if (this.log) { console.log("No falseIntentDirective specified"); }
        callback();
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
      console.log("--> action.assignSourceTo: ", action.assignSourceTo)
      console.log("--> source: ", source)
      if (action.assignSourceTo && source) {
        console.log("--> source: ", source)
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

  myrequest(options, callback) {
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

module.exports = { DirAskGPT }