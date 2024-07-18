const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../models/TiledeskChatbotUtil');
let axios = require('axios');
const { TiledeskChatbotConst } = require('../../models/TiledeskChatbotConst');

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
    this.tdclient = context.tdclient;
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action;
      if (!action.attributes) {
        action.attributes = {}
      }
      action.attributes.fillParams = true;
    }
    else {
      console.error("Incorrect directive (no action provided):", directive);
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    if (this.log) {console.log("(DirContactUpdate) start. Update properties:",  action.update); }
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
      updateProperties[key] = filler.fill(value, requestAttributes);
      if (this.log) {console.log("(DirContactUpdate) updating property:", key, "value:", value); }
    }
    const leadId = requestAttributes[TiledeskChatbotConst.REQ_USER_LEAD_ID_KEY];
    this.tdclient.updateLead(leadId, updateProperties, null, null, () => {
      if (this.log) {console.log("(DirContactUpdate) Lead updated.", updateProperties);}
      // send hidden info to update widget lead fullname only if it is a conversation!
      if (this.log) {console.log("(DirContactUpdate) requestId:", this.requestId); }
      if (this.log) {console.log("(DirContactUpdate) updateProperties:", updateProperties); }
      if (this.log) {console.log("(DirContactUpdate) updateProperties['fullname']:", updateProperties['fullname']); }
      if (this.requestId.startsWith("support-group") && updateProperties['userFullname']) {
        if (this.log) {console.log("(DirContactUpdate) send hidden info to update widget lead fullname"); }
        const userFullname = updateProperties['fullname'];
        const updateLeadDataOnWidgetMessage = {
          type: "text",
          text: "Updated lead fullname on widget with: " + userFullname,
          attributes: {
            subtype: "info",
            updateUserFullname: userFullname
          }
        };
        if (this.log) {console.log("(DirContactUpdate) sending updateLeadDataOnWidgetMessage:", updateLeadDataOnWidgetMessage); }
        this.context.tdclient.sendSupportMessage(
          this.requestId,
          updateLeadDataOnWidgetMessage,
          (err) => {
            if (err) {
              console.error("(DirContactUpdate) Error sending reply:", err);
            }
            if (this.log) {console.log("(DirContactUpdate) hidden message sent:", updateLeadDataOnWidgetMessage);}
            callback();
        });
      }
      else {
        callback();
      }
    });
  }
}

module.exports = { DirContactUpdate };