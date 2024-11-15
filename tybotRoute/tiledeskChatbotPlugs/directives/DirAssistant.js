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
      if (this.log) {console.log("(DirAssistant, stop?", stop); }
      callback(stop);
    });
  }

  async go(action, callback) {
    if (this.log) {console.log("DirAssistant action:", JSON.stringify(action));}
    let requestAttributes = null;
    if (this.tdcache) {
      requestAttributes = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );
    }
    
    const filler = new Filler();
    const url = filler.fill(action.url, requestAttributes);
    // prompt => Mandatory
    // assistantId => Mandatory
    // threadIdAttribute => Optional // default "firstThread"
    // assignResultTo => Optional // default "assistantReply"
    // assignErrorTo => Optional // default "assistantError"
    // action.settings.timeout => Optional
  
    let assignResultTo = "assistantReply";
    if (action.assignResultTo) {
      assignResultTo = action.assignResultTo;
    }

    let assignErrorTo = "assistantError";
    if (action.assignErrorTo) {
      assignErrorTo = action.assignErrorTo;
    }

    let threadIdAttribute = "firstThread";
    if (action.threadIdAttribute) {
      threadIdAttribute = action.threadIdAttribute;
    }

    let _assistantId = null;
    if (action.assistantId) { // mandatory
      _assistantId = action.assistantId;
    }
    else {
      // TODO: LOG SETTINGS ERROR
      console.error("DirAssistant error: no assistantId.");
      callback();
      return;
    }

    let _prompt = null;
    if (action.prompt) { // mandatory
      _prompt = action.prompt;
    }
    else {
      // TODO: LOG SETTINGS ERROR
      console.error("DirAssistant error: no prompt.");
      callback();
      return;
    }

    let assistantId = _assistantId;
    try {
      assistantId = filler.fill(_assistantId, requestAttributes);
    }
    catch(error) {
      console.error("Error while filling assistantId:", error);
    }

    let prompt = _prompt;
    try {
      prompt = filler.fill(_prompt, requestAttributes);
    }
    catch(error) {
      console.error("Error while filling prompt:", error);
    }

    if (this.log) {
      console.log("settings ok");
      console.log("prompt:", prompt);
      console.log("assistantId:", assistantId);
    }
    // Condition branches
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    if (trueIntent && trueIntent.trim() === "") {
      trueIntent = null;
    }
    if (falseIntent && falseIntent.trim() === "") {
      falseIntent = null;
    }

    this.timeout = this.#webrequest_timeout(action, 20000, 1, 300000);
    
    let apikey = await this.getGPT_APIKEY();
    if (this.log) {console.log("apikey:", apikey);}
    if (!apikey) {
      const reply = "OpenAI APIKEY is mandatory for ChatGPT Assistants. Add your personal OpenAI APIKEY in Settings > Integrations";
      if (this.log) { console.error(reply); };
      await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, assignErrorTo, reply);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, null, falseIntent, null);
        callback(true);
      }
      return;
    }
    else {
      apikey = "Bearer " + apikey;
    }
    let threadId = null;
    try {
      threadId = requestAttributes[threadIdAttribute];
      if (!threadId || (threadId && threadId.trim() === '') ) {
        // create thread if it doesn't exist
        if (this.log) {console.log("Creating thread");}
        const thread = await this.createThread(apikey);
        if (this.log) {console.log("Thread crated.");}
        threadId = thread.id;
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, threadIdAttribute, threadId);
        if (this.log) {
          console.log("thread:", thread);
          console.log("threadId:", threadId);
        }
      }
      else {
        if (this.log) { console.log("Reusing threadId (used flow attribute:" + threadIdAttribute + "):", threadId); }
      }
      await this.addMessage(prompt, threadId, apikey);
      if (this.log) {console.log("Message added.");}
      await this.runThreadOnAssistant(assistantId, threadId, apikey);
      let messages = await this.threadMessages(threadId, apikey);
      let lastMessage = null;
      if (messages && messages.data && messages.data.length > 0 && messages.data[0]) {
        if (messages.data[0].content.length > 0 && messages.data[0].content[0] && messages.data[0].content[0].text) {
          lastMessage = messages.data[0].content[0].text.value;
        }
      }

      // process.exit(0);
      if (lastMessage !== null) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, assignResultTo, lastMessage);
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, "lastMessageData", messages.data[0].content); // content is an array, see on this source end for messages structure example, including content. Ex get annotation[0]: content[0].text.annotations[0]
        if (trueIntent) {
          await this.#executeCondition(true, trueIntent, null, falseIntent, null);
          callback(true);
        }
        else {
          callback(false);
          return;
        }
      }
      else {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, assignResultTo, null);
        if (falseIntent) {
          await this.#executeCondition(false, trueIntent, null, falseIntent, null);
          callback(true);
        }
        else {
          callback(false);
          return;
        }
      }
    }
    catch (error) {
      if (this.log) { console.error("error:", error); }
      await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, assignErrorTo, error);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, null, falseIntent, null);
      }
      callback(true);
      return;
    }
    
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
        });
      }
      else {
        if (this.log) {console.log("No trueIntentDirective specified");}
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
        if (this.log) {console.log("No falseIntentDirective specified");}
        if (callback) {
          callback();
        }
      }
    }
  }

  #webrequest_timeout(action, default_timeout, min, max) {
    let timeout = default_timeout;
    if (!action.settings) {
      return timeout;
    }
    
    if (action.settings.timeout) {
      if ((typeof action.settings.timeout === "number") && action.settings.timeout > min && action.settings.timeout < max) {
        timeout = Math.round(action.settings.timeout)
        // console.log("new timeout:", timeout);
      }
    }
    return timeout
  }

  async getGPT_APIKEY() {
    if (process.env.TEST_OPENAI_APIKEY) {
      return process.env.TEST_OPENAI_APIKEY
    }
    else {
      const server_base_url = process.env.API_ENDPOINT || process.env.API_URL;
      return await this.getKeyFromIntegrations(server_base_url);
    }
  }

  async createThread(apikey) {
    if (this.log) { console.log("creating thread..."); }
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
      if (this.log) {console.log("DirAssistant HTTPREQUEST", HTTPREQUEST);}
      this.#myrequest(
        HTTPREQUEST, async (err, res) => {
          let status = res.status;
          if (err) {
            if (this.log) {console.error("DirAssistant error:", err);}
            reject(err);
          }
          else if(res.status >= 200 && res.status <= 299) {
            if (this.log) {console.log("got threadid res:", res);}
            let thread = res.data;
            resolve(thread)
          }
          else {
            reject(new Error("Thread creation status != 200:", status));
          }
        }
      );
    });
  }
  
  async addMessage(prompt, threadId, apikey) {
  
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
    const json_payload = {
      "role": "user",
      "content": prompt
    }

    return new Promise( async (resolve, reject) => {
      const url = `https://api.openai.com/v1/threads/${threadId}/messages`;
      const headers = {
        "Authorization": apikey,
        "OpenAI-Beta": "assistants=v2"
      }
      const HTTPREQUEST = {
        url: url,
        headers: headers,
        json: json_payload,
        method: "POST",
        timeout: this.timeout
      };
      if (this.log) {console.log("DirAssistant HTTPREQUEST", HTTPREQUEST);}
      this.#myrequest(
        HTTPREQUEST, async (err, res) => {
          let status = res.status;
          if (err) {
            if (this.log) {console.error("DirAssistant error:", err);}
            reject(err);
          }
          else if(res.status >= 200 && res.status <= 299) {
            if (this.log) {console.log("got response data:", res.data);}
            // let return_body = res.data;
            resolve();
          }
          else {
            reject(new Error("Message add status != 200:", status));
          }
        }
      );
    });
  }
  
  async runThreadOnAssistant(assistantId, threadId, apikey) {
    let _run = await this.createRun(threadId, assistantId, apikey);
    if (this.log) {console.log("Got run:", _run);}
    let runId = _run.id;
    if (this.log) {console.log("runId:", runId);}
    let status = null;
    do {
      if (this.log) {console.log("Getting run...");}
      const wait_for = 2000;
      if (this.log) {console.log("Waiting:", wait_for);}
      await new Promise(resolve => setTimeout(resolve, wait_for));
      let run = await this.getRun(threadId, runId, apikey);
      status = run.status;
      if (this.log) {console.log("Run status:", status);}
    }
    while (status === "queued" || status === "in_progress" || status === "requires_action" && status === "cancelling");
    // while (status != "completed" && status != "cancelled" && status != "failed" && status != "expired");
    // queued, in_progress, requires_action, cancelling
    if (this.log) {console.log("Run end.");}
  }

  async createRun(threadId, assistantId, apikey) {
    const json_payload = {
      "assistant_id": assistantId
    }

    return new Promise( async (resolve, reject) => {
      if (this.log) {console.log("adding message to thread...");}
      const url = `https://api.openai.com/v1/threads/${threadId}/runs`;
      const headers = {
        "Authorization": apikey,
        "OpenAI-Beta": "assistants=v2"
      }
      const HTTPREQUEST = {
        url: url,
        headers: headers,
        json: json_payload,
        method: "POST",
        timeout: this.timeout
      };
      if (this.log) {console.log("DirAssistant HTTPREQUEST", HTTPREQUEST);}
      this.#myrequest(
        HTTPREQUEST, async (err, res) => {
          let status = res.status;
          if (err) {
            if (this.log) {console.error("DirAssistant error:", err);}
            reject(err);
          }
          else if(res.status >= 200 && res.status <= 299) {
            if (this.log) {console.log("got response data:", res.data);}
            // let return_body = res.data;
            resolve(res.data);
          }
          else {
            reject(new Error("Message add status != 200:", status));
          }
        }
      );
    });
  }

  async getRun(threadId, runId, apikey) {
    return new Promise( async (resolve, reject) => {
      const url = `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`;
      const headers = {
        "Authorization": apikey,
        "OpenAI-Beta": "assistants=v2"
      }
      const HTTPREQUEST = {
        url: url,
        headers: headers,
        json: null,
        method: "GET",
        timeout: this.timeout
      };
      if (this.log) {console.log("DirAssistant HTTPREQUEST", HTTPREQUEST);}
      this.#myrequest(
        HTTPREQUEST, async (err, res) => {
          let status = res.status;
          if (err) {
            if (this.log) {console.error("DirAssistant error:", err);}
            reject(err);
          }
          else if(res.status >= 200 && res.status <= 299) {
            if (this.log) {console.log("got response data:", res.data);}
            // let return_body = res.data;
            resolve(res.data);
          }
          else {
            reject(new Error("Message add status != 200:", status));
          }
        }
      );
    });
  }

  async threadMessages(threadId, apikey) {
    return new Promise( async (resolve, reject) => {
      const url = `https://api.openai.com/v1/threads/${threadId}/messages`;
      const headers = {
        "Authorization": apikey,
        "OpenAI-Beta": "assistants=v2"
      }
      const HTTPREQUEST = {
        url: url,
        headers: headers,
        json: null,
        method: "GET",
        timeout: this.timeout
      };
      if (this.log) {console.log("DirAssistant HTTPREQUEST", HTTPREQUEST);}
      this.#myrequest(
        HTTPREQUEST, async (err, res) => {
          let status = res.status;
          if (err) {
            if (this.log) {console.error("DirAssistant error:", err);}
            reject(err);
          }
          else if(res.status >= 200 && res.status <= 299) {
            if (this.log) {console.log("got response data:", res.data);}
            // let return_body = res.data;
            resolve(res.data);
          }
          else {
            reject(new Error("Message add status != 200:", status));
          }
        }
      );
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
      if (this.log) { console.log("DirAssistant INTEGRATIONS_HTTPREQUEST ", INTEGRATIONS_HTTPREQUEST) }

      this.#myrequest(
        INTEGRATIONS_HTTPREQUEST, async (err, res) => {
          if (err) {
            resolve(null);
          } else {
            let integration = res.data;
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
          // console.log("Success Response:", res);
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
          console.error("(DirAssistant) An error occurred: ", error_log);
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
            {
              status: status,
              data: data,
              error: errorMessage
            }, data
          );
        }
      });
    }
    catch(error) {
      console.error("Error:", error);
    }
  }

}



module.exports = { DirAssistant };

// Messages list response example

/*
{
  "object": "list",
  "data": [
      {
          "id": "msg_FfKaNU82uBYQU9gANFkKJ5Wi",
          "object": "thread.message",
          "created_at": 1721681044,
          "assistant_id": null,
          "thread_id": "thread_fN0rAdyJlPmN9uteMP0yWsCl",
          "run_id": null,
          "role": "user",
          "content": [
              {
                  "type": "text",
                  "text": {
                      "value": "vendete sedie di altezza superiore o uguale a 50 cm?",
                      "annotations": []
                  }
              }
          ],
          "file_ids": [],
          "metadata": {}
      },
      {
          "id": "msg_Ddxnqi7M9vvLdS9YYO4FHjVt",
          "object": "thread.message",
          "created_at": 1721680934,
          "assistant_id": "asst_qNjiwCVxo3kL2mnN1QyP50Zb",
          "thread_id": "thread_fN0rAdyJlPmN9uteMP0yWsCl",
          "run_id": "run_k8mPIrZPnsO0hAiezD9y2f1t",
          "role": "assistant",
          "content": [
              {
                  "type": "text",
                  "text": {
                      "value": "Una delle best practices raccomandate per garantire un alto livello di sicurezza informatica per la linea di prodotti \"boss\" è la seguente:\n\n- Aggiornare i dispositivi con l'ultima versione del firmware disponibile. È possibile consultare il portale KSA per verificare la disponibilità degli aggiornamenti【6:0†source】.\n\nSe hai altri dubbi o necessiti di ulteriori informazioni, non esitare a chiedere!",
                      "annotations": [
                          {
                              "type": "file_citation",
                              "text": "【6:0†source】",
                              "start_index": 305,
                              "end_index": 317,
                              "file_citation": {
                                  "file_id": "file-dwR6qSwVUIrhImd9espzExGw",
                                  "quote": ""
                              }
                          }
                      ]
                  }
              }
          ],
          "file_ids": [],
          "metadata": {}
      },
      {
          "id": "msg_ng244T4mymroFWZ912r9DvWZ",
          "object": "thread.message",
          "created_at": 1721680931,
          "assistant_id": null,
          "thread_id": "thread_fN0rAdyJlPmN9uteMP0yWsCl",
          "run_id": null,
          "role": "user",
          "content": [
              {
                  "type": "text",
                  "text": {
                      "value": "dimmi una delle best practices  che conosci",
                      "annotations": []
                  }
              }
          ],
          "file_ids": [],
          "metadata": {}
      }
  ],
  "first_id": "msg_FfKaNU82uBYQU9gANFkKJ5Wi",
  "last_id": "msg_ng244T4mymroFWZ912r9DvWZ",
  "has_more": false
}
*/