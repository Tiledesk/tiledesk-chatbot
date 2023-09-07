const axios = require("axios").default;
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { Filler } = require('../Filler');
let https = require("https");
require('dotenv').config();

const GPT_URL = "https://tiledesk-whatsapp-app-pre.giovannitroisi3.repl.co/ext"

class DirAskGPT {

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
    console.log("AskGPT directive: ", directive);
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
    if (this.log) {console.log("webRequest action:", JSON.stringify(action));}
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
    
    // get gptkey con servizio (token chatbot) con un servizio la myrequest...

    let json = {
      "question": filled_question,
      "kbid": action.kbid,
      "gptkey": "ABCD"
    };
    if (this.log) {console.log("question_gpt:", json);}
    
    const url = process.env.GPT_ENDPOINT; //"https://tiledesk-playground.azurewebsites.net/api/qa"; // TODO INSERIRE IN ENV
    if (this.log) {console.log("DirAskGPT URL", url);}
    const HTTPREQUEST = {
      url: url,
      json: json,
      method: "POST"
    };
    if (this.log) {console.log("webRequest HTTPREQUEST", HTTPREQUEST);}
    this.myrequest(
      HTTPREQUEST, async (err, resbody) => {
        if (this.log) {console.log("webRequest resbody:", resbody);}
        if (err) {
          if (this.log) {console.error("webRequest error:", err);}
          if (callback) {
            callback();
          }
        }
        else if (callback) {
          if (this.log) {
            console.log("resbody", resbody);
            console.log("this.context.requestId", this.context.requestId);
            console.log("callback", callback);
            console.log("assignReplyTo", action.assignReplyTo);
            console.log("assignSourceTo", action.assignSourceTo);
          }
          if (action.assignReplyTo) {
            await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignReplyTo, resbody.answer);
          }
          if (action.assignSourceTo) {
            await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignSourceTo, resbody.source_url);
          }
          if (this.log) {
            console.log("All AskGPT new paramenters:", await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId));
          }
          callback();
        }
      }
    );
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
    .catch( (error) => {
      console.error("An error occurred:", JSON.stringify(error));
      if (callback) {
        callback(error, null);
      }
    });
  }

}

module.exports = { DirAskGPT }