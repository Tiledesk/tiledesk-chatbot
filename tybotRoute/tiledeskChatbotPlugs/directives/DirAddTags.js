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
require('dotenv').config();
const winston = require('../../utils/winston');

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

    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___",
      log: this.log
    });
  }

  execute(directive, callback) {
    winston.verbose("Execute AddTags directive");
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
    })
  }

  async go(action, callback) {
    winston.debug("(DirAddTags) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirAddTags) Error: tdcache is mandatory");
      callback();
      return;
    }

    // default value
    let target = "request";
    let pushToList = false;

    target = action.target
    pushToList = action.pushToList

    if (!action.tags || action.tags === '') {
      winston.error("(DirAddTags) Error: tags attribute is mandatory")
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
    winston.debug("(DirAddTags) filled_tags: ", filled_tags);

    /** use case: CONVERSATION */
    if(target === 'request'){
      
      let newTags = filled_tags.split(',').filter(tag => tag !== '').map(el => el.trim())

      if(action.pushToList){
        newTags.forEach(async (tag) => {
          let tags = await this.addNewTag(tag)
          if(!tags){
            callback();
            return;
          }
        })
      }

      winston.debug('(DirAddTags) UPDATE request with newTags', newTags)
      let updatedRequest = await this.updateRequestWithTags(newTags)
      if(!updatedRequest){
        callback();
        return;
      }

    }

    /** use case: LEAD */
    if(target === 'lead'){
      let newTags = filled_tags.split(',').filter(tag => tag !== '').map(el => el.trim())

      let request = await this.tdClient.getRequestById(this.requestId);
      winston.debug('(DirAddTags) request detail: ', request)
      if(!request){
        winston.debug("(DirAddTags) - request not found for request_id: " + this.requestId);
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

      winston.debug('(DirAddTags) UPDATE lead with newTags ', newTags)
      let updatedLead = await this.updateLeadWithTags(request.lead._id, newTags)
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

  #myrequest(options, callback) {
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
            winston.error("(httprequest) DirAddTags add tags to list err: ", err);
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
      winston.debug('(httprequest) DirAddTags updateRequestWithTags tags: ', json)
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
            winston.error("(httprequest) DirAddTags patch request with new tags err: ", err);
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
            winston.error("(httprequest) DirAddTags put lead with new tags err: ", err);
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