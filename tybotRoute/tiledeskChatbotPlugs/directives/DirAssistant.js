let axios = require('axios');
let https = require("https");
const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { DirIntent } = require('./DirIntent');

class DirAssistant {
  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdclient = context.tdclient;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("Incorrect directive:", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, (stop) => {
      if (this.log) {console.log("(webrequestv2, stop?", stop); }
      callback(stop);
    });
  }

  async go(action, callback) {
    if (this.log) {console.log("webRequest action:", JSON.stringify(action));}
    let requestAttributes = null;
    if (this.tdcache) {
      requestAttributes = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );
    }
    
    const filler = new Filler();
    const url = filler.fill(action.url, requestAttributes);

    // message => Mandatory
    // assistantId => Mandatory
    // threadIdAttributeName => Optional
    // replyAttributeName => Optional
    // errorAttributeName => Optional
    // action.settings.timeout

    let replyAttributeName = "assistantReply";
    if (action.replyAttributeName) { // default = "assistantReply"
      replyAttributeName = action.replyAttributeName;
    }

    let errorAttributeName = "assistantError";
    if (action.errorAttributeName) { // default = "assistantError"
      errorAttributeName = action.errorAttributeName;
    }

    let threadIdAttributeName = "firstThread";
    if (action.threadIdAttributeName) { // default = "firstThread"
      threadIdAttributeName = action.threadIdAttributeName;
    }

    let _assistantId = null;
    if (action.assistantId) { // mandatory
      _assistantId = action.assistant;
    }
    else {
      // TODO MANAGE SETTINGS ERROR
      callback(false);
      return;
    }

    let _message = null;
    if (action.message) { // mandatory
      _message = action.message;
    }
    else {
      // TODO MANAGE SETTINGS ERROR
      callback(false);
      return;
    }

    let assistantId = _assistantId;
    try {
      assistantId = filler.fill(_assistantId, requestAttributes);
    }
    catch(error) {
      console.error("Error while filling assistantId:", error);
    }

    let message = _message;
    try {
      message = filler.fill(_message, requestAttributes);
    }
    catch(error) {
      console.error("Error while filling message:", error);
    }
    
    // Condition branches
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    const trueIntentAttributes = action.trueIntentAttributes;
    const falseIntentAttributes = action.falseIntentAttributes;
    let stopOnConditionMet = action.stopOnConditionMet;
    if (trueIntent && trueIntent.trim() === "") {
      trueIntent = null;
    }
    if (falseIntent && falseIntent.trim() === "") {
      falseIntent = null;
    }

    this.timeout = this.#webrequest_timeout(action, 20000, 1, 300000);
    
    const apikey = await this.getGPT_APIKEY();
    let threadId = requestVariables[threadIdAttributeName];
    if (!threadId || (threadId && threadId.trim() === '') ) {
      // create thread if it doesn't exist
      threadId = await this.createThread(apikey);
    }
    await this.addMessage(threadId, apikey);
    await this.runThreadOnAssistant(assistantId, threadId, apikey);
    await this.lastThreadMessage(threadId, apikey);

    if (this.log) {console.log("webRequest URL", url);}
    
    const HTTPREQUEST = {
      url: url,
      headers: headers,
      json: json,
      method: action.method,
      timeout: timeout
    };

    if (this.log) {console.log("webRequest HTTPREQUEST", HTTPREQUEST);}
    this.#myrequest(
      HTTPREQUEST, async (err, res) => {
        if (this.log && err) {
          console.log("webRequest error:", err);
        }
        if (this.log) {console.log("got res:", res);}
        let resbody = res.data;
        let status = res.status;
        let error = res.error;
        await this.#assignAttributes(action, resbody, status, error)
        if (this.log) {console.log("webRequest resbody:", resbody);}
        if (err) {
          if (this.log) {console.error("webRequest error:", err);}
          if (callback) {
            if (falseIntent) {
              this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
                callback(true); // stop the flow
              });
            }
            else {
              callback(false); // continue the flow
            }
          }
        }
        else if(res.status >= 200 && res.status <= 299) {
          if (trueIntent) {
            await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
              callback(true); // stop the flow
            });
          }
          else {
            callback(false); // continue the flow
          }
        }
        else {
          if (falseIntent) {
            this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
              callback(true); // stop the flow
            });
          }
          else {
            callback(false); // continue the flow
          }
        }
      }
    );
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
        });
      }
      else {
        if (this.log) {console.log("No trueIntentDirective specified");}
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
        if (this.log) {console.log("No falseIntentDirective specified");}
        callback();
      }
    }
  }

  async #assignAttributes(action, resbody, status, error) {
    if (this.log) {
      console.log("assignAttributes resbody:", resbody)
      console.log("assignAttributes error:", error)
      console.log("assignAttributes status:", status)
      console.log("assignAttributes action:", action)
    }
    if (this.context.tdcache) {
      if (action.assignResultTo && resbody) {
        if (this.log) {console.log("assign assignResultTo:", resbody);}
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignResultTo, resbody);
      }
      if (action.assignErrorTo && error) {
        if (this.log) {console.log("assign assignResultTo:", error);}
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignErrorTo, error);
      }
      if (action.assignStatusTo && status) {
        if (this.log) {console.log("assign assignStatusTo:", status);}
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignStatusTo, status);
      }
      // Debug log
      if (this.log) {
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          if (this.log) {console.log("(webRequest) request parameter:", key, "value:", value, "type:", typeof value)}
        }
      }
    }
  }

  #myrequest(options, callback) {
    try {
      if (this.log) {
        console.log("API URL:", options.url);
        //console.log("** Options:", JSON.stringify(options));
        // Stringify "options". FIX THE STRINGIFY OF CIRCULAR STRUCTURE BUG - START
        let cache = [];
        let str_Options = JSON.stringify(options, function(key, value) { // try to use a separate function
          if (typeof value === 'object' && value != null) {
            if (cache.indexOf(value) !== -1) {
              return;
            }
            cache.push(value);
          }
          return value;
        });
        console.log("** Options:", str_Options);


      }
      let axios_options = {
        url: options.url,
        method: options.method,
        params: options.params,
        headers: options.headers,
        timeout: options.timeout
      }
    
      if (options.json !== null) {
        axios_options.data = options.json
      }
      // if (this.log) {
      //   console.log("axios_options:", JSON.stringify(axios_options));
      // }
      if (options.url.startsWith("https:")) {
        const httpsAgent = new https.Agent({
          rejectUnauthorized: false,
        });
        axios_options.httpsAgent = httpsAgent;
      }
    
      axios(axios_options)
      .then((res) => {
        if (this.log) {
          console.log("Success Response:", res);
          console.log("Response for url:", options.url);
          console.log("Response headers:\n", JSON.stringify(res.headers));
        }
        if (callback) {
          callback(null, res);
        }
      })
      .catch( (err) => {
        if (this.log) {
          if (err.response) {
            console.log("Error Response data:", err.response.data);
          }
          // FIX THE STRINGIFY OF CIRCULAR STRUCTURE BUG - START
          let cache = [];
          let error_log = JSON.stringify(err, function(key, value) { // try to use a separate function
            if (typeof value === 'object' && value != null) {
              if (cache.indexOf(value) !== -1) {
                return;
              }
              cache.push(value);
            }
            return value;
          });
          console.error("An error occurred: ", error_log);
          // FIX THE STRINGIFY OF CIRCULAR STRUCTURE BUG - END
          // console.error("An error occurred:", JSON.stringify(err));
        }
        if (callback) {
          let status = 1000;
          let cache = [];
          let str_error = JSON.stringify(err, function(key, value) { // try to use a separate function
            if (typeof value === 'object' && value != null) {
              if (cache.indexOf(value) !== -1) {
                return;
              }
              cache.push(value);
            }
            return value;
          });
          let error = JSON.parse(str_error) // "status" disappears without this trick
          let errorMessage = JSON.stringify(error);
          if (error.status) {
            status = error.status;
          }
          if (error.message) {
            errorMessage = error.message;
          }
          let data = null;
          if (err.response) {
            data =  err.response.data;
          }
          callback(
            null, {
              status: status,
              data: data,
              error: errorMessage
            }
          );
        }
      });
    }
    catch(error) {
      console.error("Error:", error);
    }
  }

  #webrequest_timeout(action, default_timeout, min, max) {
    let timeout = default_timeout;
    if (!action.settings) {
      return timeout;
    }
    // console.log("default timeout:", timeout);
    // console.log("action.settings:", action.settings);
    // console.log("action.settings.timeout:", action.settings.timeout);
    // console.log("typeof action.settings.timeout:", typeof action.settings.timeout);
    // console.log("action.settings.timeout > min", action.settings.timeout > min)
    // console.log("action.settings.timeout < max", action.settings.timeout < max)  
    
    if (action.settings.timeout) {
      if ((typeof action.settings.timeout === "number") && action.settings.timeout > min && action.settings.timeout < max) {
        timeout = Math.round(action.settings.timeout)
        // console.log("new timeout:", timeout);
      }
    }
    // console.log("returning timeout:", timeout);
    return timeout
  }

  async getGPT_APIKEY() {

  }

  async createThread(apikey) {
    return new Promise( async (resolve, reject) => {
      const url = "https://api.openai.com/v1/threads";
      const headers = {
        "Authorization": apikey,
        "OpenAI-Beta": "assistants=v2"
      }
      const HTTPREQUEST = {
        url: url,
        headers: headers,
        json: '', // no old messages on creation
        method: "POST",
        timeout: this.timeout
      };
      if (this.log) {console.log("webRequest HTTPREQUEST", HTTPREQUEST);}
      this.#myrequest(
        HTTPREQUEST, async (err, res) => {
          if (this.log && err) {
            console.log("webRequest error:", err);
          }
          if (this.log) {console.log("got res:", res);}
          let resbody = res.data;
          let status = res.status;
          let error = res.error;
          await this.#assignAttributes(action, resbody, status, error)
          if (this.log) {console.log("webRequest resbody:", resbody);}
          if (err) {
            if (this.log) {console.error("webRequest error:", err);}
            if (callback) {
              if (falseIntent) {
                this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
                  callback(true); // stop the flow
                });
              }
              else {
                callback(false); // continue the flow
              }
            }
          }
          else if(res.status >= 200 && res.status <= 299) {
            if (trueIntent) {
              await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
                callback(true); // stop the flow
              });
            }
            else {
              callback(false); // continue the flow
            }
          }
          else {
            if (falseIntent) {
              this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
                callback(true); // stop the flow
              });
            }
            else {
              callback(false); // continue the flow
            }
          }
        }
      );
    });
    // POST 
    // JSON = ''
  }
  
  async addMessage(threadId, apikey) {
  
    // POST https://api.openai.com/v1/threads/{{threadID}}/messages
  
    // JSON
    /*
    {
    "role": "user",
    "content": {{last_user_text | json}},
    "attachments": [
      {
        "file_id": "file-9rf2OwoLy22Q6bePkO0Zmhlc",
        "tools": [
          {
            "type": "code_interpreter"
          }
        ]
      }
    ]
  }
  */
  }
  
  async runThreadOnAssistant(threadId, assistantId, apikey) {
  
  }
}



module.exports = { DirAssistant };