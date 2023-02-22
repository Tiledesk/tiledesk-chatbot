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

  async go(action, callback) {
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

    let headers = null;
    if (action.headersString) {
      let headersString = filler.fill(action.headersString, requestVariables);
      try {
        headers = JSON.parse(headersString);
      }
      catch(err) {
        console.error("Error parsing webRequest headersString as JSON:", headersString);
      }
      // for (const [key, value] of Object.entries(action.headers)) {
      //   action.headers[key] = filler.fill(value, requestVariables);
      // }
    }
    let json = null;
    if (action.jsonBody) {
      let jsonBody = filler.fill(action.jsonBody, requestVariables);
      try {
        json = JSON.parse(jsonBody);
      }
      catch(err) {
        console.error("Error parsing webRequest jsonBody:", jsonBody);
      }
    }
    
    if (this.log) {console.log("webRequest URL", url);}
    const HTTPREQUEST = {
      url: url,
      headers: headers,
      json: json,
      method: action.method
    };
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
          if (action.assignTo && this.context.tdcache && resbody) {
            if (this.log) {console.log("(webRequest) this.requestId:", this.context.requestId);}
            let attributes =
              await TiledeskChatbot.allParametersStatic(
                this.context.tdcache, this.context.requestId);
            // filling
            let attributeValue;
            const filler = new Filler();
            attributeValue = filler.fill(resbody, attributes);
            if (this.log) {console.log("(webRequest) Attributes:", JSON.stringify(attributes));}
            await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignTo, attributeValue);
            if (this.log) {
              console.log("(webRequest) Assigned:", action.assignTo, "=", attributeValue);
              const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
              for (const [key, value] of Object.entries(all_parameters)) {
                const value_type = typeof value;
                if (this.log) {console.log("(webRequest) request parameter:", key, "value:", value, "type:", value_type)}
              }
            }
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
          callback(new Error("Response status is not 200"), null);
        }
      }
    })
    .catch( (error) => {
      // console.error("An error occurred:", JSON.stringify(error));
      if (callback) {
        callback(error, null);
      }
    });
  }
}

module.exports = { DirWebRequest };