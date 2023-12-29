const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
let https = require("https");
require('dotenv').config();


class DirHubspot {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.log = context.log;
    this.intentDir = new DirIntent(context);
    if (this.log) {console.log('LOG: ', this.log)};
  }

  execute(directive, callback) {
    if (this.log) { console.log("DirHubspot directive: ", directive); }
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("DirHubspot Incorrect directive: ", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("DirHubspot action:", JSON.stringify(action)); }
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    if (this.log) {console.log('DirHubspot trueIntent',trueIntent)}
    if (!this.tdcache) {
      console.error("Error: DirHubspot tdcache is mandatory");
      callback();
      return;
    }
    //console.log('DirHubspot work!');
    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    if (this.log) {
      const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
      for (const [key, value] of Object.entries(all_parameters)) {
        if (this.log) { console.log("DirHubspot request parameter:", key, "value:", value, "type:", typeof value) }
      }
    }
    
    let token = action.token;
    let bodyParameters = action.bodyParameters;
    if (this.log) {
      console.log("DirHubspot token: ", token);
      console.log("DirHubspot bodyParameters: ", bodyParameters);
    }
    if (!bodyParameters || bodyParameters === '') {
      if (this.log) {console.error("DirHubspot ERROR - bodyParameters is undefined or null or empty string")};
      callback();
      return;
    }
    if (!token || token === '') {
      if (this.log) {console.error("DirHubspot ERROR - token is undefined or null or empty string:")};
      let status = 422;   
      let error = 'Missing hubspot access token';
      await this.#assignAttributes(action, status, error);
      this.#executeCondition(false, trueIntent, null, falseIntent, null, () => {
        callback(); // stop the flow
      });
      return;
    }
    let url;
    try {
      // HUBSPOT_ENDPONT
      let hubspot_base_url = process.env.HUBSPOT_ENDPONT;
      if (hubspot_base_url) {
        url = hubspot_base_url + "/hubspot/";
      } else {
        url = action.url;
      }
      // HUBSPOT ACCESS TOKEN
      let token = action.token;
      if (this.log) {
        console.log('DirHubspot hubspot_base_url: ',url)
        console.log('DirHubspot access token: ',token)
      }

      const filler = new Filler();
      for (const [key, value] of Object.entries(bodyParameters)) {
        if (this.log) {console.log("bodyParam:", key, "value:", value)}
        let filled_value = filler.fill(value, requestVariables);
        bodyParameters[key] = filled_value;
      }
      if (this.log) {console.log('DirHubspot bodyParameters filler: ',bodyParameters)}
    

    
    // Condition branches
    //let trueIntent = action.trueIntent;
    //let falseIntent = action.falseIntent;
    //console.log('DirHubspot trueIntent',trueIntent)
 
    if (this.log) { console.log("DirHubspot Hubspot access token: ", token); }
    const MAKE_HTTPREQUEST = {
      url: url,
      headers: {
        'authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      json: bodyParameters,
      method: "POST"
    }
  
    if (this.log) { console.log("myrequest/DirHubspot MAKE_HTTPREQUEST", JSON.stringify(MAKE_HTTPREQUEST)); }
    this.#myrequest(
      MAKE_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
            if (this.log) {
              console.error("respose/(httprequest) DirHubspot err response:", err.response)
              console.error("respose/(httprequest) DirHubspot err data:", err.response.data)
            };
            let status = null;   
            let error;
            //-------------------------------------------------------
            if (err.response &&
              err.response.status) {
                  status = err.response.status;
            }
            if (err.response &&
              err.response.data &&
              err.response.data.message) {
                error = err.response.data.message;
            }
            
            //-------------------------------------------------------
            if (this.log) {
            console.log("FALSE");
            console.error("respose/(httprequest) DirHubspot err data status:", status);
            console.error("respose/(httprequest) DirHubspot err data error:", error);
            console.error("respose/(httprequest) DirHubspot err action:", action);}
            await this.#assignAttributes(action, status, error);
            this.#executeCondition(false, trueIntent, null, falseIntent, null, () => {
              callback(false); // continue the flow
            });
            callback();
          }
        } else if (callback) {
          if (this.log) { console.log("respose/DirHubspot Hubspot resbody: ", JSON.stringify(resbody, null, 2)); }
          console.log("TRUE");
          let status = 201;   
          let error = null;
          await this.#assignAttributes(action, status, error); 
          await this.#executeCondition(true, trueIntent, null, falseIntent, null, () => {
            callback(); // stop the flow
          });
          if (this.log) { console.log('respose/status: ',status)}
          //callback();
        }
      }
    );
  } catch(e) {
    console.error('error: ', e)
  }
  }

  async #assignAttributes(action, status, error) {
    if (this.log) {
      console.log("DirHubspot assignAttributes action:", action)
      console.log("DirHubspot assignAttributes status:", status)
      console.log("DirHubspot assignAttributes error:", error)
    }
    if (this.context.tdcache) {
      if (action.assignStatusTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignStatusTo, status);
      }
      if (action.assignErrorTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignErrorTo, error);
      }

      // Debug log
      if (this.log) {
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          if (this.log) { console.log("DirHubspot request parameter:", key, "value:", value, "type:", typeof value) }
        }
      }
    }
  }

  #myrequest(options, callback) {
    if (this.log) {
      console.log("** API URL:", options.url);
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
          console.log("Response status:", res.status);
          console.log("Response headers11:\n", JSON.stringify(res.headers));
        }
        if (res && res.status == 201 && res.data) {
          if (callback) {
            callback(null, res.data);
          }
        }
        else {
          if (callback) {
            callback(new Error("Response status is not 201"), null);
          }
        }
      })
      .catch((error) => {
        if (this.log) {console.error("An error occurred:", JSON.stringify(error.message))};
        if (callback) {
          callback(error, null);
        }
      });
  }
  async #executeCondition(result, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, callback) {
    let trueIntentDirective = null;
   
    if (trueIntent) {
      //console.log('executeCondition/trueIntent',trueIntent)
      trueIntentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
      //console.log('executeCondition/trueIntentDirective',trueIntentDirective)
      //console.log('executeCondition/trueIntentAttributes',trueIntentAttributes)
    }
    let falseIntentDirective = null;
    if (falseIntent) {
      falseIntentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
    }
    if (this.log) {console.log('DirHubspot executeCondition/result',result)}
    if (result === true) {
      if (trueIntentDirective) {
        console.log("--> TRUE")
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
        console.log("--> FALSE");
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
}

module.exports = { DirHubspot }