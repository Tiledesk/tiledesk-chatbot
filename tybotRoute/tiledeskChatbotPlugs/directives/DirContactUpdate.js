const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../models/TiledeskChatbotUtil');
let axios = require('axios');

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
    for (const [key, value] of Object.entries(requestAttributes)) {
      updateProperties[key] = filler.fill(value, requestAttributes);
      if (this.log) {console.log("(DirContactUpdate) updating property:", key, "value:", value); }
    }
    this.tdclient.updateLead(this.supportRequest.lead._id, updateProperties, null, null, () => {
      if (this.log) {console.log("Lead updated.", updateProperties);}
      // send hidden info to update widget lead fullname only if it is a conversation!
      if (this.requestId.startsWith("support-group") && updateProperties['fullname']) {
        const userFullname = updateProperties['fullname'];
        updateLeadDataOnWidgetMessage = {
          type: "text",
          text: "Updated lead fullname on widget with: " + userFullname,
          attributes: {
            subtype: "info",
            updateUserFullname: userFullname
          }
        };
        this.context.tdclient.sendSupportMessage(
          this.requestId,
          updateLeadDataOnWidgetMessage,
          (err) => {
            if (err) {
              console.error("Error sending reply:", err);
            }
            if (this.log) {console.log("Reply message sent:", updateLeadDataOnWidgetMessage);}
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