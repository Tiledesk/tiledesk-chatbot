//const { HelpCenter } = require('./HelpCenter');
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

  async execute(directive, pipeline, maxresults, completion) {
    let workspace_id = null;
    let default_hc_reply = "No matching reply but...\n\nI found something interesting in the Help Center 🧐\n\nTake a look 👇";
    let hc_reply = default_hc_reply;
    if (directive.parameter) {
      // console.log("processing parameters")
      const params = this.parseParams(directive.parameter);
      // console.log("parameters found", params);
      workspace_id = params.workspace_id;
      // console.log("workspaceid found", workspace_id);
      if (params.hc_reply) {
        hc_reply = params.hc_reply;
        // console.log("hc_reply found", hc_reply);
      }
    }
    else {
      hc_reply = default_hc_reply;
    }
    //console.log("workspace_id param:", workspace_id);
    //console.log("hc_reply param:", hc_reply);
    let message = pipeline.message;
    //console.log("help center message", JSON.stringify(message));
    const original_text = message.attributes.intent_info.question_payload.text;
    //console.log("original_text", original_text);
    if (original_text && original_text.trim() != '') {
      const helpcenter = new HelpCenterQuery({
        APIKEY: "__",
        APIURL: this.helpcenter_api_endpoint,
        projectId: this.projectId,
        log: true
      });
      if (!workspace_id) {
        try {
          // find/select the first workspace
          const workspaces = await helpcenter.allWorkspaces();
          if (workspaces.length > 0) {
            workspace_id = workspaces[0]._id;
            // console.log("First Workspace selected", workspaces[0]);
          }
          else {
            // console.log("No Workspace found");
            completion();
          }
        }
        catch(err) {
          console.error("deflectToHelpCenter Error (search workspaces):", err);
          completion();
        }
      }
      // console.log("searching on workspace_id:", workspace_id);
      try {
        const results = await helpcenter.search(workspace_id, original_text, maxresults);
        if (results && results.length > 0) {
          // console.log("Successfully got results", results);
          // console.log("Sending REPL", hc_reply);
          pipeline.message.text = hc_reply;
          results.forEach(content => {
            if (content.url.charAt(content.url.length -1) != "/") {
                content.url = content.url + "/"
            }
            pipeline.message.text += "\n* " + content.title + " > " + content.url;
          });
        }
        completion();
      }
      catch(err) {
        console.error("deflectToHelpCenter Error (searching results):", err);
        completion();
      }
    }
    else {
      completion();
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