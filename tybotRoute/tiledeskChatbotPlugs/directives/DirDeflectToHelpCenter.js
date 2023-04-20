const { HelpCenterQuery } = require('@tiledesk/helpcenter-query-client');
const ms = require('minimist-string');

class DirDeflectToHelpCenter {

  constructor(config) {
    if (!config.projectId) {
      throw new Error('projectId is mandatory.');
    }
    if (config.HELP_CENTER_API_ENDPOINT) {
      this.helpcenter_api_endpoint = config.HELP_CENTER_API_ENDPOINT;
    }
    //console.log("Using helpcenter_api_endpoint:", this.helpcenter_api_endpoint)
    this.projectId = config.projectId;
  }

  async execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action
    }
    else if (directive.parameter) {
      const params = this.parseParams(directive.parameter);
      workspace_id = params.workspace_id;
      if (params.hc_reply) {
        hc_reply = params.hc_reply;
      }
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
    // let message = pipeline.message;
    //console.log("help center message", JSON.stringify(message));
    const original_text = message.attributes.intent_info.question_payload.text;
    if (this.log) {console.log("original_text", original_text);}
    if (original_text && original_text.trim() != '') {
      const helpcenter = new HelpCenterQuery({
        APIKEY: "__",
        projectId: this.projectId,
        log: false
      });
      if (this.helpcenter_api_endpoint) {
        helpcenter.APIURL = this.helpcenter_api_endpoint
      }
      if (!workspace_id) {
        try {
          // find/select the first workspace
          const workspaces = await helpcenter.allWorkspaces();
          if (workspaces.length > 0) {
            workspace_id = workspaces[0]._id;
            // console.log("First Workspace selected", workspaces[0]);
          }
          else {
            if (this.log) {console.log("No Workspaces found");}
            callback(false);
          }
        }
        catch(err) {
          console.error("deflectToHelpCenter Error (search workspaces):", err);
          callback(false);
        }
      }
      if (this.log) {console.log("searching on workspace_id:", workspace_id);}
      try {
        const results = await helpcenter.search(workspace_id, original_text, maxresults);
        if (results && results.length > 0) {
          // console.log("Successfully got results", results);
          // console.log("Sending REPL", hc_reply);
          // pipeline.message.text = hc_reply;
          let buttons = [];
          results.forEach(content => {
            const button = {
							"type": "url",
							"value": content.title,
							"link": content.url,
							"target": "blank"
						}
            buttons.add(button);
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

          if (this.log) {console.log("HC reply:", JSON.stringify(message))};
          this.context.tdclient.sendSupportMessage(
            this.requestId,
            message,
            (err) => {
              if (err) {
                console.error("Error sending reply:", err.message);
                callback(false);
              }
              if (this.log) {console.log("Reply message sent.");}
              callback(true);
          });
        }
        else {
          callback(false);
        }
      }
      catch(err) {
        console.error("deflectToHelpCenter Error (searching results):", err);
        callback(false);
      }
    }
    else {
      callback(false);
    }
  }

  parseParams(directive_parameter) {
    let workspace_id = null;
    let hc_reply = null;
    // console.log("ms found:", ms)
    const params = ms(directive_parameter);
    // console.log("ms decoded params:", params)
    if (params.w) {
      workspace_id = params.w
    }
    if (params.workspace) {
      workspace_id = params.workspace
    }
    
    if (params.m) {
      // console.log("_params.m:", params.m)
      //hc_reply = params.m.replaceAll("\\n", "\n");
      hc_reply = params.m.replace(/\\n/g, "\n");
      // console.log("hc_reply with replaced slash n regex|replaceAll", hc_reply)
    }
    if (params.message) {
      // console.log("_params.message:", params.message)
      //hc_reply = params.message.replaceAll("\\n", "\n");
      hc_reply = params.message.replace(/\\n/g, "\n");
      // console.log("hc_reply -message with replaced slash n replace(/\\n/g", hc_reply)
    }
    return {
      workspace_id: workspace_id,
      hc_reply: hc_reply
    }
  }
}

module.exports = { DirDeflectToHelpCenter };