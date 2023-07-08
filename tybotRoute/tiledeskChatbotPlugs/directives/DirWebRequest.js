let axios = require('axios');
let https = require("https");
const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskJSONEval } = require('../../TiledeskJSONEval');

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

    let headers = {};
    if (action.headersString) {
      let headersDict = action.headersString
      for (const [key, value] of Object.entries(headersDict)) {
        if (this.log) {console.log("header:", key, "value:", value)}
        let filled_value = filler.fill(value, requestVariables);
        headers[key] = filled_value;
      }
      // try {
      //   headers = JSON.parse(headersString);
      // }
      // catch(err) {
      //   console.error("Error parsing webRequest headersString as JSON:", headersString);
      // }
      // for (const [key, value] of Object.entries(action.headers)) {
      //   action.headers[key] = filler.fill(value, requestVariables);
      // }
    }
    let json = null;
    if (action.jsonBody && action.jsonBody !== "{}") {
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
          if (action.assignTo && this.context.tdcache && resbody) { // DEPRECATED
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
          } else if (action.assignments && this.context.tdcache && resbody) {
            if (this.log) {console.log("(webRequest) action.assignments for request:", this.context.requestId);}
            let json_body;
            if (typeof resbody === "string") {
              json_body = {
                body: resbody
              }
            }
            else {
              json_body = resbody
            }
            if (this.log) {console.log("(webRequest) action.assignments json_body:", json_body);}
            let attributes =
              await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
              if (this.log) {console.log("(webRequest) action.assignments attributes:", attributes);}
            const assignments = action.assignments;
            if (this.log) {console.log("(webRequest) assignments:", assignments);}
            for (const [attr_name, attr_eval_expression] of Object.entries(assignments)) {
              if (this.log) {console.log("", attr_name, attr_eval_expression);}
              let attributeValue;
              try {
                attributeValue = TiledeskJSONEval.eval(json_body, attr_eval_expression);
                if (this.log) {console.log("(webRequest) Assigning to:", attr_name, "value:", attributeValue);}
              }
              catch(err) {
                console.error("Error:", err);
              }
              console.log("(webRequest)----");
              try {
                await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, attr_name, attributeValue);
              }
              catch(err) {
                console.error("Error:", err);
              }
              
              console.log("(did)----");
            }
            if (this.log) {
              console.log("(webRequest) All attributes:");
              const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
              for (const [key, value] of Object.entries(all_parameters)) {
                const value_type = typeof value;
                if (this.log) {console.log("(webRequest) request attribute:", key, "value:", value, "type:", value_type)}
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
      params: options.params,
      headers: options.headers
    }
    if (options.json !== null) {
      axios_options.data = options.json
    }
    if (this.log) {
      console.log("axios_options:", axios_options);
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