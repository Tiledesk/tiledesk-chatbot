const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
let https = require("https");
require('dotenv').config();


class DirCustomerio {

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
    if (this.log) { console.log("DirCustomerio directive: ", directive); }
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("DirCustomerio Incorrect directive: ", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("DirCustomerio action:", JSON.stringify(action)); }
    let token = action.token;
    let formid = action.formid;
    let bodyParameters = action.bodyParameters;

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    if (this.log) {console.log('DirCustomerio trueIntent',trueIntent)}
    if (!this.tdcache) {
      console.error("Error: DirCustomerio tdcache is mandatory");
      callback();
      return;
    }
    console.log('DirCustomerio work!');
    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    if (this.log) {
      const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
      for (const [key, value] of Object.entries(all_parameters)) {
        if (this.log) { console.log("DirCustomerio request parameter:", key, "value:", value, "type:", typeof value) }
      }
    }
    
    //let token = action.token;
    //let bodyParameters = action.bodyParameters;
    if (this.log) {
      console.log("DirCustomerio token: ", token);
      console.log("DirCustomerio formid: ", formid);
      console.log("DirCustomerio bodyParameters: ", bodyParameters);
    }
    if (!bodyParameters || bodyParameters === '') {
      if (this.log) {console.error("DirCustomerio ERROR - bodyParameters is undefined or null or empty string")};
      callback();
      return;
    }
    if (!token || token === '') {
      if (this.log) {console.error("DirCustomerio ERROR - token is undefined or null or empty string:")};
      let status = 422;   
      let error = 'Missing customerio access token';
      await this.#assignAttributes(action, status, error);
      this.#executeCondition(false, trueIntent, null, falseIntent, null, () => {
        callback(); // stop the flow
      });
      return;
    }
    let url;
    try {
      // CUSTOMERIO_ENDPONT
      let customer_base_url = process.env.CUSTOMERIO_ENDPONT;
      if (customer_base_url) {
        url = customer_base_url + "/api/v1/forms/"+formid+"/submit";
        if (this.log) {console.log('DirCustomerio customer_base_url: ',url)};
      } else {
        url = "http://localhost:10002/api/v1/forms/"+formid+"/submit";
        console.log('DirCustomerio url: ',url);
      }
      // CUSTOMER ACCESS TOKEN
      //let token = action.token;
      if (this.log) {
        console.log('DirCustomerio url: ',url);
        console.log('DirCustomerio access token: ',token);
      }

      const filler = new Filler();
      for (const [key, value] of Object.entries(bodyParameters)) {
        if (this.log) {console.log("bodyParam:", key, "value:", value)}
        let filled_value = filler.fill(value, requestVariables);
        bodyParameters[key] = filled_value;
      }
      if (this.log) {console.log('DirCustomerio bodyParameters filler: ',bodyParameters)}
    

    
    // Condition branches
    //let trueIntent = action.trueIntent;
    //let falseIntent = action.falseIntent;
    //console.log('DirCustomerio trueIntent',trueIntent)
 
    if (this.log) { console.log("DirCustomerio Customerio access token: ", token); }
    const CUSTOMERIO_HTTPREQUEST = {
      url: url,
      headers: {
        'authorization': 'Basic ' + token,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'User-Agent': 'TiledeskBotRuntime',
        'Accept': '*/*'
      },
      json: {
        "data": bodyParameters
      },
      method: "POST"
    }
  
    if (this.log) { console.log("myrequest/DirCustomerio CUSTOMERIO_HTTPREQUEST", JSON.stringify(CUSTOMERIO_HTTPREQUEST)); }
    this.#myrequest(
      CUSTOMERIO_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
            if (this.log) {
              console.error("respose/(httprequest) DirCustomerio err response:", err)
            };
            let status = null;   
            let error;
            //-------------------------------------------------------
            // if (err.response &&
            //   err.response.status) {
            //       status = err.response.status;
            // }
            // if (err.response &&
            //   err.response.data &&
            //   err.response.data.meta && err.response.data.meta.error) {
            //     error = err.response.data.meta.error;
            // }
            
            //-------------------------------------------------------
            if (this.log) {
            console.log("FALSE");
            //console.error("respose/(httprequest) DirCustomerio err data status:", status);
            //console.error("respose/(httprequest) DirCustomerio err data error:", error);
            console.error("respose/(httprequest) DirCustomerio err action:", action);}
            await this.#assignAttributes(action, status, error);
            this.#executeCondition(false, trueIntent, null, falseIntent, null, () => {
              callback(false); // continue the flow
            });
            callback();
          }
        } else if (callback) {
          if (this.log) { console.log("respose/DirCustomerio Customerio resbody: ", JSON.stringify(resbody, null, 2)); }
          console.log("TRUE");
          let status = 204;   
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
      console.log("DirCustomerio assignAttributes action:", action)
      console.log("DirCustomerio assignAttributes status:", status)
      console.log("DirCustomerio assignAttributes error:", error)
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
          if (this.log) { console.log("DirCustomerio request parameter:", key, "value:", value, "type:", typeof value) }
        }
      }
    }
  }

  #myrequest(options, callback) {
    if (this.log) {
      console.log("** API URL:", options.url);
      console.log("** Options:", JSON.stringify(options));
      console.log("** Options JSON:", JSON.stringify(options.json));
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
          console.log("Response:", res.config.data);
          console.log("Response status:", res.status);
          console.log("Response headers:\n", JSON.stringify(res.headers));
        }
        if (res && res.status == 204) {
          if (callback) {
            callback(null, res.config.data);
          }
        }
        else {
          if (callback) {
            callback(new Error("Response status is not 204"), null);
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
    if (this.log) {console.log('DirCustomerio executeCondition/result',result)}
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

module.exports = { DirCustomerio }