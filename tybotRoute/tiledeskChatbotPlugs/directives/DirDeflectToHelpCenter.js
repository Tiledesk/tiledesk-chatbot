const { HelpCenterQuery } = require('@tiledesk/helpcenter-query-client');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot.js');
const { TiledeskChatbotConst } = require('../../engine/TiledeskChatbotConst.js');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../utils/winston');

class DirDeflectToHelpCenter {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.API_ENDPOINT = context.API_ENDPOINT;

    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___", log: this.log });
  }

  async execute(directive, callback) {
    winston.verbose("Execute DeflectToHelpCenter directive");
    let action;
    if (directive.action) {
      action = directive.action
    }
    this.go(action, (stop) => {
      callback(stop);
    });
  }

  async go(action, callback) { //directive, pipeline, maxresults, completion) {
    let default_hc_reply = "No matching reply but...\n\nI found something interesting in the Help Center 🧐\n\nTake a look 👇";
    let hc_reply = default_hc_reply;
    if (action.hcReply) {
      hc_reply = action.hcReply;
    }
    let workspace_id = action.workspaceId;
    let project_id = this.context.projectId;
    if (action.projectId) {
      project_id = action.projectId;
    }
    let maxresults = 3;
    if (action.maxresults) {
      maxresults = action.maxresults;
    }
    let url_target = "blank";
    if (action.urlTarget) {
      url_target = action.urlTarget;
    }
    // let message = pipeline.message;
    const last_user_text = await TiledeskChatbot.getParameterStatic(
      this.context.tdcache,
      this.context.requestId,
      TiledeskChatbotConst.REQ_LAST_USER_TEXT_KEY);
      winston.debug("(DirDeflectToHelpCenter) last_user_text", last_user_text);
    if (last_user_text && last_user_text.trim() !== '') {
      const helpcenter = new HelpCenterQuery({
        APIKEY: "__",
        projectId: project_id
      });
      if (this.helpcenter_api_endpoint) {
        helpcenter.APIURL = this.helpcenter_api_endpoint
      }
      if (!workspace_id) {
        winston.debug("(DirDeflectToHelpCenter) No workspaces_id. Listing all workspaces to eventually select the first");
        try {
          // find/select the first workspace
          const workspaces = await helpcenter.allWorkspaces();
          if (workspaces.length > 0) {
            workspace_id = workspaces[0]._id;
          }
          else {
            winston.debug("(DirDeflectToHelpCenter) No Workspaces found");
            callback(false);
          }
        }
        catch(err) {
          winston.error("(DirDeflectToHelpCenter) Error search workspaces: ", err);
          callback(false);
        }
      }
      winston.debug("(DirDeflectToHelpCenter) searching on workspace_id: " + workspace_id);
      try {
        const results = await helpcenter.search(workspace_id, last_user_text, maxresults);
        if (results && results.length > 0) {
          winston.debug("(DirDeflectToHelpCenter) Successfully got results ", results);
          winston.debug("(DirDeflectToHelpCenter) Sending hcReply ", hc_reply);
          // pipeline.message.text = hc_reply;
          let buttons = [];
          results.forEach(content => {
            const button = {
							"type": "url",
							"value": content.title,
							"link": content.url,
							"target": url_target
						}
            buttons.push(button);
            // if (content.url.charAt(content.url.length -1) != "/") {
            //     content.url = content.url + "/"
            // }
            // pipeline.message.text += "\n* " + content.title + " > " + content.url;
          });
          const message = {
            "text": hc_reply,
            "attributes": {
              "disableInputMessage": false,
              "commands": [
                {
                  "type": "wait",
                  "time": 0
                },
                {
                  "type": "message",
                  "message": {
                    "type": "text",
                    "text": hc_reply,
                    "attributes": {
                      "attachment": {
                        "type": "template",
                        "buttons": buttons
                      }
                    }
                  }
                }
              ]
            }
          }

          winston.debug("(DirDeflectToHelpCenter) HC reply: ", message)
          this.tdClient.sendSupportMessage(
            this.context.requestId,
            message,
            (err) => {
              if (err) {
                winston.error("(DirDeflectToHelpCenter) Error sending reply: " + err.message);
                callback(false);
              }
              winston.debug("(DirDeflectToHelpCenter) Reply message sent.");
              callback(true);
          });
        }
        else {
          winston.debug("(DirDeflectToHelpCenter) Nothing found in Help Center. projectId: " + project_id + " workspaceId: " + workspace_id);
          callback(false);
        }
      }
      catch(err) {
        winston.error("(DirDeflectToHelpCenter)  Error (searching results): ", err);
        callback(false);
      }
    }
    else {
      callback(false);
    }
  }
}

module.exports = { DirDeflectToHelpCenter };