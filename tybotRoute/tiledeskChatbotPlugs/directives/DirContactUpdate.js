const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../utils/TiledeskChatbotUtil');
let axios = require('axios');
const { TiledeskChatbotConst } = require('../../engine/TiledeskChatbotConst');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');

class DirContactUpdate {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.projectId = context.projectId;
    this.requestId = context.requestId;
    this.supportRequest = context.supportRequest;
    this.token = context.token;
    this.tdcache = context.tdcache;
    this.API_ENDPOINT = context.API_ENDPOINT;
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest.draft, intent_id: this.context.reply.attributes.intent_info.intent_id });

    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___"
    });
  }

  execute(directive, callback) {
    this.logger.info("[Lead Update] Executing action");
    winston.verbose("Execute ContactUpdate directive")
    let action;
    if (directive.action) {
      action = directive.action;
      if (!action.attributes) {
        action.attributes = {}
      }
      action.attributes.fillParams = true;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirContactUpdate Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
      this.logger.info("[Lead Update] Action completed");
      callback();
    });
  }

  async go(action, callback) {
    winston.debug("(DirContactUpdate) Action: ", action);
    const contactProperties = action.update;
    
    // fill
    let requestAttributes = null;
    if (this.tdcache) {
      requestAttributes = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );
    }
    const filler = new Filler();
    let updateProperties = {}
    for (const [key, value] of Object.entries(contactProperties)) {
      let filled_value = filler.fill(value, requestAttributes);
      updateProperties[key] = filled_value;
      // it's important that all the lead's properties are immediatly updated in the current flow invocation so the updated values will be available in the next actions
      if (key === "fullname") {
        await this.context.chatbot.addParameter(TiledeskChatbotConst.REQ_LEAD_USERFULLNAME_KEY, filled_value);
      }
      else if ( key === "email") {
        await this.context.chatbot.addParameter(TiledeskChatbotConst.REQ_LEAD_EMAIL_KEY, filled_value);
      }
    }
    const leadId = requestAttributes[TiledeskChatbotConst.REQ_USER_LEAD_ID_KEY];
    this.tdClient.updateLead(leadId, updateProperties, null, null, () => {
      // send hidden info to update widget lead fullname only if it is a conversation!
      winston.debug("(DirContactUpdate) requestId: " + this.requestId); 
      winston.debug("(DirContactUpdate) updateProperties: ", updateProperties); 
      winston.debug("(DirContactUpdate) updateProperties['fullname']: " + updateProperties['fullname']); 
      callback();
      // if (this.requestId.startsWith("support-group") && updateProperties['userFullname']) {
      //   const userFullname = updateProperties['fullname'];
      //   const updateLeadDataOnWidgetMessage = {
      //     type: "text",
      //     text: "Updated lead fullname on widget with: " + userFullname,
      //     attributes: {
      //       // subtype: "info",
      //       updateUserFullname: userFullname
      //     }
      //   };
      //   this.tdClient.sendSupportMessage(
      //     this.requestId,
      //     updateLeadDataOnWidgetMessage,
      //     (err) => {
      //       callback();
      //   });
      // }
      // else {
      //   callback();
      // }
    });
  }
}

module.exports = { DirContactUpdate };