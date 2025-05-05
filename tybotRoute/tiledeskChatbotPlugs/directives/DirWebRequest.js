let axios = require('axios');
let https = require("https");
const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskJSONEval } = require('../../TiledeskJSONEval');
const winston = require('../../utils/winston');

class DirWebRequest {
  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
  }

  execute(directive, callback) {
    winston.verbose("Execute WebRequest directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirWebRequest Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    winston.debug("(DirWebRequest) Action: ", action);
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
        let filled_value = filler.fill(value, requestVariables);
        headers[key] = filled_value;
      }
    }
    let json = null;
    if (action.jsonBody && action.jsonBody !== "{}") {
      let jsonBody = filler.fill(action.jsonBody, requestVariables);
      try {
        json = JSON.parse(jsonBody);
      }
      catch(err) {
        winston.debug("(DirWebRequest) Error parsing webRequest jsonBody: ", jsonBody);
      }
    }
    
    winston.verbose("(DirWebRequest) webRequest URL " + url);
    const HTTPREQUEST = {
      url: url,
      headers: headers,
      json: json,
      method: action.method
    };
    winston.debug("(DirWebRequest) HttpRequest ", HTTPREQUEST);
    this.myrequest(
      HTTPREQUEST, async (err, resbody) => {
        winston.debug("(DirWebRequest) resbody: ", resbody);
        if (err) {
          winston.error("(DirWebRequest)  error:", err);
          if (callback) {
            callback();
          }
        }
        else if (callback) {
          if (action.assignTo && this.context.tdcache && resbody) { // DEPRECATED
            let attributes =
              await TiledeskChatbot.allParametersStatic(
                this.context.tdcache, this.context.requestId);
            // filling
            let attributeValue;
            const filler = new Filler();
            attributeValue = filler.fill(resbody, attributes);
            await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignTo, attributeValue);
          } else if (action.assignments && this.context.tdcache && resbody) {
            let json_body;
            if (typeof resbody === "string") {
              json_body = {
                body: resbody
              }
            }
            else {
              json_body = resbody
            }
            let attributes = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
            const assignments = action.assignments;
            for (const [attr_name, attr_eval_expression] of Object.entries(assignments)) {
              let attributeValue;
              try {
                attributeValue = TiledeskJSONEval.eval(json_body, attr_eval_expression);
              }
              catch(err) {
                winston.error("(DirWebRequest) Error:", err);
              }
              try {
                await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, attr_name, attributeValue);
              }
              catch(err) {
                winston.error("(DirWebRequest) Error: ", err);
              }
            }
          }
          callback();
        }
      }
    );
  }

  myrequest(options, callback) {
    let axios_options = {
      url: options.url,
      method: options.method,
      params: options.params,
      headers: options.headers
    }
    if (options.json !== null) {
      axios_options.data = options.json
    }
    if (options.url.startsWith("https:")) {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });
      axios_options.httpsAgent = httpsAgent;
    }
    axios(axios_options)
    .then((res) => {
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
      winston.error("(DirWebRequest) Axios error: ", error.response.data);
      if (callback) {
        callback(error, null);
      }
    });
  }
}

module.exports = { DirWebRequest };