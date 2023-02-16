let axios = require('axios');
let https = require("https");
const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');

class DirWebRequest {
  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdclient = context.tdclient;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
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
    this.go(action, () => {
      callback();
    });
  }

  async go(action, completion) {
    if (this.log) {console.log("webRequest action:", JSON.stringify(action));}

    let requestVariables = null;
    if (this.tdcache) {
      requestVariables = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );
    }
    const filler = new Filler();
    const url = filler.fill(action.url, requestVariables);
    if (action.headers) {
      for (const [key, value] of Object.entries(action.headers)) {
        action.headers[key] = filler.fill(value, requestVariables);
      }
    }
    let jsonBody = null;
    if (action.jsonBody) {
      jsonBody = filler.fill(action.jsonBody, requestVariables);
    }
    
    if (this.log) {console.log("sendSupportMessageExt URL", url);}
    const HTTPREQUEST = {
      url: url,
      headers: action.headers,
      json: jsonBody,
      method: action.method
    };
    this.myrequest(
      HTTPREQUEST,
      function(err, resbody) {
        //console.log("sendSupportMessageExt resbody:", resbody);
        if (err) {
          //console.error("sendSupportMessageExt error:", err)
          if (callback) {
            completion();
          }
        }
        else {
          if (callback) {
            completion();
            // callback(null, resbody);
          }
        }
      }, this.log
    );
    // if (action.subject && action.text && action.to) {
    //   try {
    //     let requestVariables = null;
    //     if (this.tdcache) {
    //       requestVariables = 
    //       await TiledeskChatbot.allParametersStatic(
    //         this.tdcache, this.requestId
    //       );
    //     }
    //     const filler = new Filler();
    //     const filled_subject = filler.fill(action.subject, requestVariables);
    //     const filled_text = filler.fill(action.text, requestVariables);
    //     const filled_to = filler.fill(action.to, requestVariables);
    //     const message_echo = await this.tdclient.sendEmail({
    //       subject: filled_subject,
    //       text: filled_text,
    //       to: filled_to
    //     });
    //     if (this.log) {console.log("email sent. filled_subject:", filled_subject);}
    //     if (this.log) {console.log("email sent. filled_text:", filled_text);}
    //     if (this.log) {console.log("email sent. filled_to:", filled_to);}
    //     if (completion) {
    //       completion(null, message_echo);
    //     }
    //     return message_echo;
    //   }
    //   catch(err) {
    //     console.error("sendEmail error:", err);
    //     if (completion) {
    //       completion(err);
    //     }
    //   }
    // }
    // else {
    //   const error = new Error("sendEmail missing mandatory parameters (to|subject|text)");
    //   if (completion) {
    //     completion(error);
    //   }
    // }
  }

  myrequest(options, callback, log) {
    if (this.log) {
      console.log("API URL:", options.url);
      console.log("** Options:", JSON.stringify(options));
    }
    let axios_options = {
      url: options.url,
      method: options.method,
      data: options.json,
      params: options.params,
      headers: options.headers
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
          callback(TiledeskClient.getErr({message: "Response status not 200"}, options, res), null, null);
        }
      }
    })
    .catch( (error) => {
      console.error("An error occurred:", error);
      if (callback) {
        callback(error, null, null);
      }
    });
  }
}

module.exports = { DirWebRequest };