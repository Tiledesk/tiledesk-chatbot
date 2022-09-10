//const { HelpCenter } = require('./HelpCenter');
const { HelpCenterQuery } = require('@tiledesk/helpcenter-query-client');
const ms = require('minimist-string');

class DirDeflectToHelpCenter {

  constructor(helpcenter_api_endpoint, projectId) {
    if (!helpcenter_api_endpoint) {
      throw new Error('helpcenter_api_endpoint is mandatory.');
    }
    if (!projectId) {
      throw new Error('projectId is mandatory.');
    }
    this.helpcenter_api_endpoint = helpcenter_api_endpoint;
    this.projectId = projectId;
  }

  async execute(directive, pipeline, maxresults, completion) {
    let workspace_id = null;
    let default_hc_reply = "No matching reply but...\n\nI found something interesting in the Help Center 🧐\n\nTake a look 👇";
    let hc_reply = default_hc_reply;
    if (directive.parameter) {
      //console.log("processing parameters")
      const params = this.parseParams(directive.parameter);
      workspace_id = params.workspace_id;
      if (params.hc_reply) {
        hc_reply = params.hc_reply;
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
        projectId: this.projectId,
        log: false
      });
      if (!workspace_id) {
        try {
          // find/select the first workspace
          const workspaces = await helpcenter.allWorkspaces();
          if (workspaces.length > 0) {
            workspace_id = workspaces[0]._id;
            //console.log("First Workspace selected", workspaces[0]);
          }
          else {
            //console.log("No Workspace found");
            completion();
          }
        }
        catch(err) {
          console.error("deflectToHelpCenter Error (search workspaces):", err);
          completion();
        }
      }
      
      try {
        const results = await helpcenter.search(workspace_id, original_text, maxresults);
        if (results && results.length > 0) {
          //console.log("Successfully got results", results);
          //console.log("Sending REPL", hc_reply);
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
    const params = ms(directive_parameter);
    if (params.w) {
      workspace_id = params.w
    }
    if (params.workspace) {
      workspace_id = params.workspace
    }
    
    if (params.m) {
      //console.log("_param m", params.m)
      hc_reply = params.m.replaceAll("\\n", "\n");
    }
    if (params.message) {
      //console.log("_param message", params.message)
      hc_reply = params.message.replaceAll("\\n", "\n");
    }
    return {
      workspace_id: workspace_id,
      hc_reply: hc_reply
    }
  }
}

module.exports = { DirDeflectToHelpCenter };