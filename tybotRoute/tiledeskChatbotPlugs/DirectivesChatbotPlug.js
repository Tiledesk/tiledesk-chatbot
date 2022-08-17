const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
//const { HelpCenter } = require('./HelpCenter');

class DirectivesChatbotPlug {

  /**
   * @example
   * const { DirectivesChatbotPlug } = require('./DirectivesChatbotPlug');
   * 
   */

  constructor(supportRequest, API_URL, token) {
    this.supportRequest = supportRequest;
    this.API_URL = API_URL;
    this.token = token;
  }

  exec(pipeline) {
    let message = pipeline.message;
    if (message.attributes && (message.attributes.directives == undefined || message.attributes.directives == false)) { // defaults to disabled
      pipeline.nextplug();
      return;
    }
    const message_text = message.text;
    console.log("processing message:", message_text);
    let parsed_result = TiledeskChatbotUtil.parseDirectives(message_text);
    console.log("Message directives:", parsed_result);
    console.log("Message text ripped from directives:", parsed_result.text);
    if (parsed_result && parsed_result.directives && parsed_result.directives.length > 0) {
      // do not process more intents. Process directives and return
      const text = parsed_result.text;
      message.text = text;
      this.directives = parsed_result.directives;
      this.processInlineDirectives(pipeline, () => {
        console.log("End process directives.");
        pipeline.nextplug();
      });
      //pipeline.nextplug();
      /*this.processDirectives( () => {
        console.log("End process directives.");
        pipeline.nextplug();
      });*/
    }
    else {
      pipeline.nextplug();
    }
    
  }


  
  moveToDepartment(tdclient, requestId, depName, callback) {
    tdclient.getAllDepartments((err, deps) => {
      console.log("deps:", deps, err);
      if (err) {
        console.error("getAllDepartments() error:", err);
        callback(err);
        return;
      }
      let dep = null;
      for(i=0; i < deps.length; i++) {
        d = deps[i];
        if (d.name.toLowerCase() === depName.toLowerCase()) {
          dep = d;
          break;
        }
      }
      if (dep) {
        tdclient.updateRequestDepartment(requestId, dep._id, null, (err) => {
          if (err) {
            console.error("An error:", err);
            callback(err);
          }
          else {
            callback();
          }
        });
      }
    });
  }

  processDirectives(theend) {
    
    const directives = this.directives;
    if (!directives || directives.length === 0) {
      console.log("No directives to process.");
      theend();
      return;
    }
    const supportRequest = this.supportRequest;
    const token = this.token;
    const API_URL = this.API_URL;
    
    const requestId = supportRequest.request_id
    const depId = supportRequest.department._id;
    const projectId = supportRequest.id_project;
    const tdclient = new TiledeskClient({
      projectId: projectId,
      token: token,
      APIURL: API_URL,
      APIKEY: "___",
      log:false
    });
    
    let i = -1;
    console.log("processing directives:", directives);
    function process(directive) {
      if (directive) {
        console.log("directive:", directive);
        console.log("directive.name:", directive.name);
      }
      let directive_name = null;
      if (directive && directive.name) {
        directive_name = directive.name.toLowerCase();
      }
      if (directive == null) {
        theend();
      }
      else if (directive_name === TiledeskChatbotUtil.DEPARTMENT_DIRECTIVE) {
        let dep_name = "default department";
        if (directive.parameter) {
          dep_name = directive.parameter;
        }
        console.log("department:", dep_name);
        moveToDepartment(tdclient, requestId, dep_name, () => {
          console.log("moved to department:", dep_name);
          process(nextDirective());
        });
      }
      else if (directive_name === TiledeskChatbotUtil.HMESSAGE_DIRECTIVE) {
        if (directive.parameter) {
          let text = directive.parameter.trim();
          let message = {
            text: text,
            attributes: {
              subtype: "info"
            }
          };
          console.log("Message:", message)
          tdclient.sendSupportMessage(requestId, message, () => {
            process(nextDirective());
          });
        }
      }
      else if (directive_name === TiledeskChatbotUtil.MESSAGE_DIRECTIVE) {
        if (directive.parameter) {
          let text = directive.parameter.trim();
          let message = {text: text};
          console.log("text.lastIndexOf(hide)", text.lastIndexOf("\\hide"))
          if (text.lastIndexOf("\\hide") >= 0) {
            console.log("HIDDEN");
            message.text = text.slice(0, text.lastIndexOf("\\hide")).trim();
            message.attributes = {
              subtype: "info"
            }
          }
          console.log("Message:", message)
          tdclient.sendSupportMessage(requestId, message, () => {
            process(nextDirective());
          });
        }
      }
      else if (directive_name === "\\agent") {
        console.log("assign to request:", requestId);
        console.log("assign to dep:", depId);
        console.log("assign to dep name:", supportRequest.department.name);
        tdclient.log = true;
        tdclient.agent(requestId, depId, (err) => {
          if (err) {
            console.error("Error moving to agent:", err);
          }
          else {
            console.log("Successfully moved to agent");
          }
          process(nextDirective());
        });
      }
      else if (directive_name === "\\removecurrentbot") {
        console.log("assign to request:", requestId);
        console.log("assign to dep:", depId);
        console.log("assign to dep name:", request.department.name);
        tdclient.log = true;
        tdclient.removeCurrentBot(requestId, (err) => {
          if (err) {
            console.error("Error removeCurrentBot():", err);
          }
          else {
            console.log("Successfully removeCurrentBot()");
          }
          process(nextDirective());
        });
      }
      else {
        console.log("Unknown directive:", directive.name);
        process(nextDirective());
      }
    }
    process(nextDirective());
    
    function nextDirective() {
      i += 1;
      console.log("i:", i);
      if (i < directives.length) {
        let nextd = directives[i];
        console.log("next:", nextd);
        return nextd;
      }
      else {
        return null;
      }
    }
  }

processInlineDirectives(pipeline, theend) {
    
    const directives = this.directives;
    if (!directives || directives.length === 0) {
      console.log("No directives to process.");
      return;
    }
    const supportRequest = this.supportRequest;
    const token = this.token;
    const API_URL = this.API_URL;
    
    const requestId = supportRequest.request_id
    const depId = supportRequest.department._id;
    const projectId = supportRequest.id_project;
    const tdclient = new TiledeskClient({
      projectId: projectId,
      token: token,
      APIURL: API_URL,
      APIKEY: "___",
      log:false
    });
    
    let i = -1;
    console.log("processing Inline directives:", directives);
    function process(directive) {
      if (directive) {
        console.log("directive:", directive);
        console.log("directive.name:", directive.name);
      }
      let directive_name = null;
      if (directive && directive.name) {
        directive_name = directive.name.toLowerCase();
      }
      if (directive == null) {
        theend();
      }
      /*else if (directive_name === "\\whenOfflineMessageLabel") {
        if (directive.parameter) {
          let label = directive.parameter.trim();
          console.log("ifOfflineSendLabel param:", label);
        }
        tdclient.log = true;
        tdclient.removeCurrentBot(requestId, (err) => {
          if (err) {
            console.error("Error removeCurrentBot():", err);
          }
          else {
            console.log("Successfully removeCurrentBot()");
          }
          process(nextDirective());
        });
      }*/
      else if (directive_name === "\\deflecttohelpcenter") {
        console.log("deflecttohelpcenter dir")
        let workspace_id = null;
        let hc_reply = "No matching reply but...\n\nI found something interesting in the Help Center 🧐\n\nTake a look..."
        if (directive.parameter) {
          const params = directive.parameter.trim().split(" ");
          if (params.length >= 1) {
            workspace_id = params[0];
          }
          const params_for_message = directive.parameter.trim().split("\"");
          if (params_for_message.length >= 2) {
            hc_reply = params_for_message[1].replaceAll("\\n", "\n");
          }
          console.log("workspace_id param:", workspace_id);
          console.log("hc_reply param:", hc_reply);
        }
        const helpcenter = new HelpCenter({
          SERVER_URL: "https://tiledesk-cms-server-prod.herokuapp.com",
          projectId: projectId,
          workspace_id: workspace_id,
          log: false
        });
        let message = pipeline.message;
        console.log("help center message", JSON.stringify(message));
        const original_text = message.attributes.intent_info.question_payload.text
        if (original_text && original_text.trim() != '') {
          helpcenter.search(original_text, 3, (err, results) => {
            if (err) {
              console.error("deflectToHelpCenter Error:", err);
            }
            else if (results && results.length > 0) {
              console.log("Successfully got results", results);
              pipeline.message.text = hc_reply;
              results.forEach(content => {
                if (content.url.charAt(content.url.length -1) != "/") {
                    content.url = content.url + "/"
                }
                pipeline.message.text += "\n* " + content.title + " > " + content.url;
              });
            }
            process(nextDirective());
          });
        }
        else {
          process(nextDirective());
        }
      }
      else {
        console.log("Unknown directive:", directive.name);
        process(nextDirective());
      }
    }
    process(nextDirective());
    
    function nextDirective() {
      i += 1;
      console.log("i:", i);
      if (i < directives.length) {
        let nextd = directives[i];
        console.log("next:", nextd);
        return nextd;
      }
      else {
        return null;
      }
    }
  }
  
}

module.exports = { DirectivesChatbotPlug };