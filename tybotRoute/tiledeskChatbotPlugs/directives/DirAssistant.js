let axios = require('axios');
let https = require("https");
const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { DirIntent } = require('./DirIntent');
const winston = require('../../utils/winston')
const httpUtils = require('../../utils/HttpUtils');
const integrationService = require('../../services/IntegrationService');

class DirAssistant {
  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.projectId = this.context.projectId;
    this.token = this.context.token;
    this.intentDir = new DirIntent(context);
    this.API_ENDPOINT = context.API_ENDPOINT;
  }

  execute(directive, callback) {
    winston.verbose("Execute Assistant directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
  }

  async go(action, callback) {
    winston.debug("(DirAssistant) Action: ", action);
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
      winston.error("(DirAssistant) Error: no assistantId.");
      callback();
      return;
    }

    let _prompt = null;
    if (action.prompt) { // mandatory
      _prompt = action.prompt;
    }
    else {
      // TODO: LOG SETTINGS ERROR
      winston.error("(DirAssistant) Error: no prompt.");
      callback();
      return;
    }

    let assistantId = _assistantId;
    try {
      assistantId = filler.fill(_assistantId, requestAttributes);
    }
    catch(error) {
      winston.error("(DirAssistant) Error while filling assistantId:", error);
    }

    let prompt = _prompt;
    try {
      prompt = filler.fill(_prompt, requestAttributes);
    }
    catch(error) {
      winston.error("(DirAssistant) Error while filling prompt:", error);
    }

    winston.debug("(DirAssistant) settings ok");
    winston.debug("(DirAssistant) prompt: " + prompt);
    winston.debug("(DirAssistant) assistantId: " + assistantId);
    
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
    if (!apikey) {
      const reply = "OpenAI APIKEY is mandatory for ChatGPT Assistants. Add your personal OpenAI APIKEY in Settings > Integrations";
      winston.error("(DirAssistant) Error: " + reply)
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
        winston.debug("(DirAssistant) Creating thread");
        const thread = await this.createThread(apikey);
        winston.debug("(DirAssistant) Thread crated.");
        threadId = thread.id;
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, threadIdAttribute, threadId);
        winston.debug("(DirAssistant) thread: ", thread);
        winston.debug("(DirAssistant) threadId: " + threadId);
      }
      else {
        winston.debug("(DirAssistant) Reusing threadId (used flow attribute: " + threadIdAttribute + "):" + threadId);
      }
      await this.addMessage(prompt, threadId, apikey);
      winston.debug("(DirAssistant) Message added.");
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
      winston.error("(DirAssistant) error:", error);
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
        winston.debug("(DirAssistant) No trueIntentDirective specified");
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
        winston.debug("(DirAssistant) No falseIntentDirective specified");
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
      }
    }
    return timeout
  }

  async getGPT_APIKEY() {
    if (process.env.TEST_OPENAI_APIKEY) {
      return process.env.TEST_OPENAI_APIKEY
    }
    else {
      return await integrationService.getKeyFromIntegrations(this.projectId, 'openai', this.token);
    }
  }

  async createThread(apikey) {
    winston.debug("(DirAssistant) creating thread...");
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
      winston.debug("(DirAssistant) DirAssistant HttpRequest", HTTPREQUEST);
      httpUtils.request(
        HTTPREQUEST, async (err, res) => {

          if (err) {
            winston.error("(DirAssistant) error: ", err);
            reject(err);
          }
          let thread = res;
          winston.debug("(DirAssistant) got threadid res: ", res);
          resolve(thread)
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
      winston.debug("(DirAssistant) HttpRequest: ", HTTPREQUEST);
      httpUtils.request(
        HTTPREQUEST, async (err, res) => {

          if (err) {
            winston.error("(DirAssistant) error: ", err);
            reject(err);
          }
          winston.debug("(DirAssistant) got response data: ", res);
          resolve();
        }
      );
    });
  }
  
  async runThreadOnAssistant(assistantId, threadId, apikey) {
    let _run = await this.createRun(threadId, assistantId, apikey);
    winston.debug("(DirAssistant) Got run: ", _run);
    let runId = _run.id;
    winston.debug("(DirAssistant) runId: " + runId);
    let status = null;
    do {
      winston.debug("(DirAssistant) Getting run...");
      const wait_for = 2000;
      winston.debug("(DirAssistant) Waiting: " + wait_for);
      await new Promise(resolve => setTimeout(resolve, wait_for));
      let run = await this.getRun(threadId, runId, apikey);
      status = run.status;
      winston.debug("(DirAssistant) Run status: " + status);
    }
    while (status === "queued" || status === "in_progress" || status === "requires_action" && status === "cancelling");
    // while (status != "completed" && status != "cancelled" && status != "failed" && status != "expired");
    // queued, in_progress, requires_action, cancelling
    winston.debug("(DirAssistant) Run end.");
  }

  async createRun(threadId, assistantId, apikey) {
    const json_payload = {
      "assistant_id": assistantId
    }

    return new Promise( async (resolve, reject) => {
      winston.debug("(DirAssistant) adding message to thread...");
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
      winston.debug("(DirAssistant) HttpRequest: ", HTTPREQUEST);
      httpUtils.request(
        HTTPREQUEST, async (err, res) => {
          if (err) {
            winston.error("(DirAssistant) error: ", err);
            reject(err);
          }
          winston.debug("(DirAddTags) got response data: ", res);
          resolve(res);
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
      winston.debug("(DirAssistant) HttpRequest: ", HTTPREQUEST);
      httpUtils.request(
        HTTPREQUEST, async (err, res) => {
          if (err) {
            winston.error("(DirAssistant) error: ", err);
            reject(err);
          }
          winston.debug("(DirAddTags) got response data: ", res);
          resolve(res);
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
      winston.debug("(DirAssistant) HttpRequest: ", HTTPREQUEST);
      httpUtils.request(
        HTTPREQUEST, async (err, res) => {
          if (err) {
            winston.error("(DirAssistant) error: ", err);
            reject(err);
          }
          winston.debug("(DirAddTags) got response data: ", res);
          resolve(res);
        }
      );
    });
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