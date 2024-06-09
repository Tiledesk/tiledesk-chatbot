const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../models/TiledeskChatbotUtil');
let axios = require('axios');

class DirLeadUpdate {

  constructor(context) {
    console.log('[DirLeadUpdate] >>>>> hello  DirLeadUpdate') 
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    console.log('DirLeadUpdate >>>>> CONTEX ', JSON.stringify(this.context)) 
    console.log("DirLeadUpdate SUPPORT REQUEST:", JSON.stringify(this.context.supportRequest));
    this.projectId = context.projectId;
    this.requestId = context.requestId;
    this.token = context.token;
    this.tdcache = context.tdcache;
    this.log = context.log;
    console.log('[DirLeadUpdate] >>>>>> log ', this.log) 
    
  }

  execute(directive, callback) {
    if (this.log) { console.log("[DirLeadUpdate] directive: ", directive); }
    let action;
    if (directive.action) {
      action = directive.action;
      if (!action.attributes) {
        action.attributes = {}
      }
      action.attributes.fillParams = true;
    }
    else {
      console.error("[DirLeadUpdate] Incorrect directive (no action provided):", directive);
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    console.log("DirLeadUpdate action:", JSON.stringify(action))
    if (this.log) { console.log("DirLeadUpdate action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirLeadUpdate tdcache is mandatory");
      callback();
      return;
    }

    // let bodyParameters = action.bodyParameters;
    // console.log("[DirLeadUpdate] go action:", action);
    // console.log("[DirLeadUpdate] go bodyParemeters:", bodyParameters);

    // let lead_fullname = bodyParameters.senderFullname;
    // let email = bodyParameters.email;
    // console.log("[DirLeadUpdate] Hello email:", email);
    

    let requestVariables = null;
    requestVariables =  await TiledeskChatbot.allParametersStatic(
      this.tdcache, this.requestId
    )

    console.log('[DirLeadUpdate] requestVariables ', requestVariables) 
    console.log('[DirLeadUpdate] HERE!!!!! 1 ')
    const filler = new Filler();
    console.log('[DirLeadUpdate] HERE!!!!! 2 ')
    
    const lead_fullname = filler.fill(action.fullname, requestVariables );
    // const lead_email = filler.fill(bodyParameters.leadEmail, requestVariables );
    console.log('[DirLeadUpdate] HERE!!!!! 3 ')
    console.log("[DirLeadUpdate] >>>>>>> Hello lead_fullname:", lead_fullname);
    // console.log("[DirLeadUpdate] >>>>>>> Hello lead_email:", lead_email);

    const server_base_url = process.env.API_ENDPOINT || process.env.API_URL;

    // // if (this.log) {
    //   console.log("[DirLeadUpdate] ApiEndpoint URL: ", server_base_url);
    // // } 
    // let key = await this.getLead(server_base_url);
    let json = {
      fullname: lead_fullname
    }
   
      // Condition branches
      let trueIntent = action.trueIntent;
      let falseIntent = action.falseIntent;
      // const trueIntentAttributes = action.trueIntentAttributes;
      // const falseIntentAttributes = action.falseIntentAttributes;
      if (trueIntent && trueIntent.trim() === "") {
        trueIntent = null;
      }
      if (falseIntent && falseIntent.trim() === "") {
        falseIntent = null;
      }
    const lead_id = await this.context.chatbot.getParameter("userLeadId");
    console.log('[DirLeadUpdate] lead_id ', lead_id ) 
    const HTTPREQUEST = {
      
      url: server_base_url + "/" + this.context.projectId + "/leads/" + this.context.request.lead._id ,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'JWT ' + this.context.token
      },
      json: json,
      method: "POST"
    }
    this.#myrequest( 
      HTTPREQUEST, async (err, res) => { 
        if (this.log && err) {
          console.log("[DirLeadUpdate] error:", err);
        }
        if (this.log) {console.log("got res:", res);}
        let resbody = res.data;
        let status = res.status;
        let error = res.error;
        await this.#assignAttributes(action, resbody, status, error);
        if (this.log) {console.log("[DirLeadUpdate] resbody:", resbody);}
        if (err) {
          if (this.log) {console.error("[DirLeadUpdate] error:", err);}
          if (callback) {
            if (falseIntent) {
              await this.#executeCondition(false, trueIntent, null, falseIntent, null);
              callback(true);
              return;
            }
            callback();
            return;
          
          }
        } else if (callback) { 
          await this.#assignAttributes(action, resbody, status, error);
          if (trueIntent) {
            await this.#executeCondition(true, trueIntent, null, falseIntent, null)
            callback(true);
            return;
          }
          callback();
          return;

        }
      });
  }


  async #assignAttributes(action, resbody, status, error) {
    if (this.log) {
      console.log("[DirLeadUpdate] assignAttributes action:", action)
      console.log("[DirLeadUpdate] assignAttributes status:", status)
      console.log("[DirLeadUpdate] assignAttributes resbody:", resbody)
      console.log("[DirLeadUpdate] assignAttributes error:", error)
    }
    if (this.context.tdcache) {
      if (action.assignStatusTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, status);
      }
      if (action.assignResultTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, resbody);
      }
      if (action.assignErrorTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, error);
      }

      // Debug log
      if (this.log) {
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          if (this.log) { console.log("[DirLeadUpdate] request parameter:", key, "value:", value, "type:", typeof value) }
        }
      }
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
    if (this.log) { console.log('[DirLeadUpdate] executeCondition/result', result) }
    if (result === true) {
      if (trueIntentDirective) {
        this.intentDir.execute(trueIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        if (this.log) { console.log("[DirLeadUpdate] No trueIntentDirective specified"); }
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
        if (this.log) { console.log("[DirLeadUpdate] No falseIntentDirective specified"); }
        if (callback) {
          callback();
        }
      }
    }
  }

  #myrequest(options, callback) {
    if (this.log) {
      console.log("[DirLeadUpdate] ** API URL:", options.url);
      console.log("[DirLeadUpdate] ** Options:", JSON.stringify(options));
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
          console.log("Response status:", JSON.stringify(res.status));
        }
        if (res && (res.status == 200 || res.status == 201) && res.data) {
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
      .catch((error) => {
        if (callback) {
          callback(error, null);
        }
      });
  }

 

 

}

module.exports = { DirLeadUpdate };