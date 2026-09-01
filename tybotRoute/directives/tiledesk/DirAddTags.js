const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../../variables/Filler");
require('dotenv').config();
const winston = require('../../utils/winston');
const tiledeskApiService = require("../../services/TiledeskApiService");
const { BaseDirective } = require("../BaseDirective");
const { Directives } = require('../Directives');

class DirAddTags extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.ADD_TAGS];

  constructor(context) {
    super(context);
    this.chatbot = this.context.chatbot;
  }

  execute(directive, callback) {
    winston.verbose("Execute AddTags action");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.debug("Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Add Tag] Executed");
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
      this.logger.error("[Add Tag] tags attribute is mandatory");
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
      this.logger.native("[Add Tag] Adding following tags to conversation: ", newTags)

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
      this.logger.native("[Add Tag] Tags added to conversation")
      if(!updatedRequest){
        callback();
        return;
      }

    }

    /** use case: LEAD */
    if(target === 'lead'){
      let newTags = filled_tags.split(',').filter(tag => tag !== '').map(el => el.trim())
      this.logger.native("[Add Tag] Adding following tags to lead: ", newTags)

      // getRequestById resolves null on a 404 but REJECTS on every other error.
      // Unguarded, that rejection escaped the async go() unhandled and the
      // callback never ran, so the conversation stalled with no reply.
      let request;
      try {
        request = await tiledeskApiService.getRequestById(
          this.context.projectId, this.requestId, this.context.token);
      }
      catch (err) {
        this.logger.error("[Add Tag] Error reading the request: ", err);
        winston.error("(DirAddTags) Error getting request " + this.requestId + ": ", err);
        callback();
        return;
      }
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
      this.logger.native("[Add Tag] Tags added to lead")
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

  async addNewTag(tag){
    const { err, resbody } = await tiledeskApiService.addTag(
      this.context.projectId,
      this.context.token,
      { tag: tag, color: '#f0806f' },
      "(DirAddTags)"
    );
    if (err) {
      this.logger.error("[Add Tag] Add tags to list error ", err?.response?.data)
      winston.error("(httprequest) DirAddTags add tags to list err: ", err);
      return true;
    }
    return resbody ? true : false;
  }


  async updateRequestWithTags(tags) {
    let json = []
    let filteredTags = tags.map((tag) => ({tag: tag, color: '#f0806f'}))
    json.push(...filteredTags)
    winston.debug('(httprequest) DirAddTags updateRequestWithTags tags: ', json)

    const { err, resbody } = await tiledeskApiService.updateRequestTags(
      this.context.projectId,
      this.requestId,
      this.context.token,
      json,
      "(DirAddTags)"
    );
    if (err) {
      this.logger.error("[Add Tag] Add tag to conversation error ", err?.response?.data);
      winston.error("(httprequest) DirAddTags patch request with new tags err: ", err);
      return true;
    }
    return resbody ? resbody : false;
  }

  async updateLeadWithTags(lead_id, tags) {
    const { err, resbody } = await tiledeskApiService.updateLeadTags(
      this.context.projectId,
      lead_id,
      this.context.token,
      tags,
      "(DirAddTags)"
    );
    if (err) {
      this.logger.error("[Add Tag] Add tag to lead error ", err?.response?.data);
      winston.error("(httprequest) DirAddTags put lead with new tags err: ", err);
      return true;
    }
    return resbody ? resbody : false;
  }


}

module.exports = { DirAddTags }