const axios = require("axios").default;
const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../Filler");
let https = require("https");
const { DirIntent } = require("./DirIntent");
const winston = require('../../utils/winston');
const httpUtils = require("../../utils/HttpUtils");
require('dotenv').config();

class DirGptTask {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.API_ENDPOINT = this.context.API_ENDPOINT;
    this.log = context.log;
    
    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
     winston.verbose("Execute GptTask directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirGptTask Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirGptTask) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirGptTask) Error: tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    winston.debug("(DirGptTask) trueIntent " + trueIntent)
        winston.debug("(DirGptTask) falseIntent " + falseIntent)
        winston.debug("(DirGptTask) trueIntentAttributes " + trueIntentAttributes)
        winston.debug("(DirGptTask) falseIntentAttributes " + falseIntentAttributes)

    // default value
    let answer = "No answer.";

    if (!action.question || action.question === '') {
      winston.debug("(DirGptTask) Error: question attribute is mandatory. Executing condition false...")
      if (falseIntent) {
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

    let max_tokens = action.max_tokens;
    let temperature = action.temperature;

    winston.debug("(DirGptTask) max_tokens: " + max_tokens);
    winston.debug("(DirGptTask) temperature: " + temperature);

    const openai_url = process.env.OPENAI_ENDPOINT + "/chat/completions";
    winston.debug("(DirGptTask) openai_url ", openai_url);

    const INTEGRATIONS_HTTPREQUEST = {
      url: this.API_ENDPOINT + "/" + this.context.projectId + "/integration/name/openai",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'JWT ' + this.context.token
      },
      method: "GET"
    }
    winston.debug("(DirGptTask) INTEGRATIONS_HTTPREQUEST ", INTEGRATIONS_HTTPREQUEST);
    
    httpUtils.request(
      INTEGRATIONS_HTTPREQUEST, async (err, integration) => {
        if (err) {
          if (callback) {
            console.error("(httprequest) DirGptTask get integrations err:", err);
            // Don't stop the flow here. Try aniway to retrieve the key from KBs
            // callback();
            // return;
          }
        } else if (callback) {
          winston.debug("(DirGptTask) get integration resbody: ", integration);

          let key;
          if (integration &&
            integration.value) {
            key = integration.value.apikey;
          }

          // key not present in integrations - for retro compatibility search in kbsettings
          if (!key) {

            winston.debug("(DirGptTask) Key not found in Integrations. Searching in kb settings...");

            const KB_HTTPREQUEST = {
              url: this.API_ENDPOINT + "/" + this.context.projectId + "/kbsettings",
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'JWT ' + this.context.token
              },
              method: "GET"
            }
            winston.debug("(DirGptTask) KB_HTTPREQUEST", KB_HTTPREQUEST);

            httpUtils.request(
              KB_HTTPREQUEST, async (err, resbody) => {
                if (err) {
                  if (callback) {
                    console.error("(httprequest) DirGptTask Get KnowledgeBase err:", err.message);
                    console.error("(httprequest) DirGptTask Get KnowledgeBase full err", err);

                    await this.#assignAttributes(action, answer);
                    if (falseIntent) {
                      await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
                      callback(true);
                      return;
                    }
                    callback();
                    return;
                  }
                } else if (callback) {
                  winston.debug("(DirGptTask) Get KnowledgeBase settings resbody:", resbody);

                  if (!resbody.gptkey) {
                    await this.#assignAttributes(action, answer);
                    if (falseIntent) {
                      await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
                      callback(true);
                      return;
                    }
                    callback();
                    return;

                  } else {

                    winston.debug("(DirGptTask) Key found in KbSettings");

                    key = resbody.gptkey;

                    let json = {
                      "model": action.model,
                      "messages": [
                        {
                          "role": "user",
                          "content": filled_question
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
                    winston.debug("(DirGptTask) json: ", json);

                    const HTTPREQUEST = {
                      url: openai_url,
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + key
                      },
                      json: json,
                      method: 'POST'
                    }
                    winston.debug("(DirGptTask) HTTPREQUEST: ", HTTPREQUEST);
                    httpUtils.request(
                      HTTPREQUEST, async (err, resbody) => {
                        if (err) {
                          console.error("(httprequest) DirGptTask openai err:", err);
                          console.error("(httprequest) DirGptTask openai err:", err.response.data);
                          await this.#assignAttributes(action, answer);
                          if (falseIntent) {
                            await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
                            callback(true);
                            return;
                          }
                          callback();
                          return;
                        } else {
                          winston.debug("(DirGptTask) resbody: ", JSON.stringify(resbody));
                          answer = resbody.choices[0].message.content;
                          let answer_json = await this.convertToJson(answer);
                          await this.#assignAttributes(action, answer_json);
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
                }
              }
            )
          } else {

            winston.debug("(DirGptTask) Key found in Integrations");

            let json = {
              "model": action.model,
              "messages": [
                {
                  "role": "user",
                  "content": filled_question
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
            winston.debug("(DirGptTask) json: ", json);

            const HTTPREQUEST = {
              url: openai_url,
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + key
              },
              json: json,
              method: 'POST'
            }
            winston.debug("(DirGptTask) HTTPREQUEST: ", HTTPREQUEST);
            httpUtils.request(
              HTTPREQUEST, async (err, resbody) => {
                if (err) {
                  console.error("(httprequest) DirGptTask openai err:", err);
                  console.error("(httprequest) DirGptTask openai err:", err.response.data);
                  await this.#assignAttributes(action, answer);
                  if (falseIntent) {
                    await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
                    callback(true);
                    return;
                  }
                  callback();
                  return;
                } else {
                  winston.debug("(DirGptTask) resbody: ", JSON.stringify(resbody));
                  answer = resbody.choices[0].message.content;
                  // check if answer is a json
                  let answer_json = await this.convertToJson(answer);
                  await this.#assignAttributes(action, answer_json);
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
      } catch(err) {
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
        winston.debug("(DirGptTask) No trueIntentDirective specified");
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
        winston.debug("(DirGptTask) No falseIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
  }

  async #assignAttributes(action, answer) {
    winston.debug("(DirGptTask) assignAttributes action:", action)
    winston.debug("(DirGptTask) assignAttributes answer:", answer)
    if (this.context.tdcache) {
      if (action.assignReplyTo && answer) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignReplyTo, answer);
      }
      // if (action.assignSourceTo && source) {
      //   await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignSourceTo, source);
      // }
    }
  }
  
}

module.exports = { DirGptTask }