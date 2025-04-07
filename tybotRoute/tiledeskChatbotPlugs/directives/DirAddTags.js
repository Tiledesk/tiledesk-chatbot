const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
let https = require("https");
const { DirIntent } = require("./DirIntent");
const { TiledeskChatbotConst } = require("../../models/TiledeskChatbotConst");
const { TiledeskChatbotUtil } = require("../../models/TiledeskChatbotUtil");
const req = require("express/lib/request");
const { update } = require("../../models/faq");
const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const { Logger } = require("../../Logger");
require('dotenv').config();

class DirAddTags {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.chatbot = this.context.chatbot;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.API_ENDPOINT = this.context.API_ENDPOINT;
    this.log = context.log;
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest.draft });

    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___",
      log: this.log
    });
  }

  execute(directive, callback) {
    if (this.log) { console.log("AddTags directive: ", directive); }
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("Incorrect directive: ", JSON.stringify(directive));
      this.logger.error("Incorrect directive for ", directive.name, directive)
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("(DirAddTags) action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: (DirAddTags) tdcache is mandatory");
      callback();
      return;
    }

    // default value
    let target = "request";
    let pushToList = false;

    target = action.target
    pushToList = action.pushToList

    if (!action.tags || action.tags === '') {
      console.error("Error: (DirAddTags) tags attribute is mandatory")
      this.logger.error("Add tags Error: tags attribute is mandatory");
      await this.chatbot.addParameter("flowError", "Add tags Error: tags attribute is mandatory");
      callback();
      return;
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    const filler = new Filler();
    const filled_tags = filler.fill(action.tags, requestVariables);
  
    if (this.log) {
      console.log("(DirAddTags) tags: ", filled_tags);
    }

    // let request = await this.tdClient.getRequestById(this.requestId);
    // if (this.log) { console.log('(DirAddTags) request detail: ', request) }
    // if(!request){
    //   if (this.log) { console.log("(DirAddTags) - request not found for request_id:", this.requestId); }
    //   callback();
    //   return;
    // }

    /** use case: CONVERSATION */
    if(target === 'request'){
      
      let newTags = filled_tags.split(',').filter(tag => tag !== '').map(el => el.trim())
      this.logger.debug("Adding following tags to conversation: ", newTags)

      if(action.pushToList){
        newTags.forEach(async (tag) => {
          let tags = await this.addNewTag(tag)
          if(!tags){
            callback();
            return;
          }
        })
      }

      if (this.log) { console.log('(DirAddTags) UPDATE request with newTags', newTags) }
      let updatedRequest = await this.updateRequestWithTags(newTags)
      this.logger.info("Tags added to conversation")
      if(!updatedRequest){
        callback();
        return;
      }

    }

    /** use case: LEAD */
    if(target === 'lead'){
      let newTags = filled_tags.split(',').filter(tag => tag !== '').map(el => el.trim())
      this.logger.debug("Adding following tags to lead: ", newTags)

      let request = await this.tdClient.getRequestById(this.requestId);
      if (this.log) { console.log('(DirAddTags) request detail: ', request) }
      if(!request){
        if (this.log) { console.log("(DirAddTags) - request not found for request_id:", this.requestId); }
        callback();
        return;
      }

      if(action.pushToList){
        newTags.forEach(async (tag) => {
          let tags = await this.addNewTag(tag)
          if(!tags){
            callback();
            return;
          }
        })
      }

      if (this.log) {  console.log('(DirAddTags) UPDATE lead with newTags', newTags) }
      let updatedLead = await this.updateLeadWithTags(request.lead._id, newTags)
      this.logger.info("Tags added to lead")
      if(!updatedLead){
        callback();
        return;
      }
    }
    
    callback();
    return;
    

  }

  async convertToJson(data) {

    return new Promise((resolve) => {
      let json = null;
      try {
        json = JSON.parse(data);
        resolve(json)
      } catch (err) {
        resolve(data)
      }
    })

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
        })
      }
      else {
        if (this.log) { console.log("No trueIntentDirective specified"); }
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
        if (this.log) { console.log("No falseIntentDirective specified"); }
        if (callback) {
          callback();
        }
      }
    }
  }

  async #assignAttributes(action, answer) {
    if (this.log) {
      console.log("assignAttributes action:", action)
      console.log("assignAttributes answer:", answer)
    }
    if (this.context.tdcache) {
      if (action.assignReplyTo && answer) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignReplyTo, answer);
      }
      // Debug log
      if (this.log) {
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          if (this.log) { console.log("(DirAddTags) request parameter:", key, "value:", value, "type:", typeof value) }
        }
      }
    }
  }

  #myrequest(options, callback) {
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
      .catch((error) => {
        if (callback) {
          callback(error, null);
        }
      });
  }

  async addNewTag(tag){
    return new Promise((resolve, reject)=> {
      const HTTPREQUEST = {
        url: this.API_ENDPOINT + "/" + this.context.projectId + "/tags",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "POST",
        json: {
          tag: tag,
          color: '#f0806f'
        }
      }
      this.#myrequest(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            console.error("(httprequest) DirAddTags add tags to list err: ", err);
            resolve(true)
          } else {
            if (resbody) {
              resolve(true)
            } else {
              resolve(false)
            }
          }
        }
      )
    })
  }


  async updateRequestWithTags(tags) {
    return new Promise((resolve) => {
      let json = []
      let filteredTags = tags.map((tag) => ({tag: tag, color: '#f0806f'}))
      json.push(...filteredTags)
      if (this.log) {
        console.log('(httprequest) DirAddTags updateRequestWithTags tags--> ', json)
      }
      const HTTPREQUEST = {
        url: this.API_ENDPOINT + "/" + this.context.projectId + "/requests/" + this.requestId + '/tag',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "PUT",
        json: json
      }

      this.#myrequest(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            console.error("(httprequest) DirAddTags patch request with new tags err: ", err);
            resolve(true)
          } else {
            if (resbody) {
              resolve(resbody)
            } else {
              resolve(false)
            }
          }
        }
      )
    })
  }

  async updateLeadWithTags(lead_id, tags) {
    return new Promise((resolve) => {
      const HTTPREQUEST = {
        url: this.API_ENDPOINT + "/" + this.context.projectId + "/leads/" + lead_id + '/tag',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "PUT",
        json: tags
      }

      this.#myrequest(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            console.error("(httprequest) DirAddTags put lead with new tags err: ", err);
            resolve(true)
          } else {
            if (resbody) {
              resolve(resbody)
            } else {
              resolve(false)
            }
          }
        }
      )
    })
  }


}

module.exports = { DirAddTags }