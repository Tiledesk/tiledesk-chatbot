const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { DirDeflectToHelpCenter } = require('./DirDeflectToHelpCenter');
const { DirOfflineHours } = require('./DirOfflineHours');
const { DirMoveToAgent } = require('./DirMoveToAgent');
const { Directives } = require('./Directives');

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
      else if (directive_name === Directives.DEPARTMENT) {
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
      else if (directive_name === Directives.HMESSAGE) {
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
      else if (directive_name === Directives.MESSAGE) {
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
      else if (directive_name === Directives.AGENT) {
        tdclient.log = false;
        const agentDir = new DirMoveToAgent(tdclient);
        directive.whenOnlineOnly = false;
        agentDir.execute(directive, requestId, depId, () => {
          process(nextDirective());
        });
        /*tdclient.agent(requestId, depId, (err) => {
          if (err) {
            console.error("Error moving to agent:", err);
          }
          else {
            console.log("Successfully moved to agent");
          }
          process(nextDirective());
        });*/
      }
      else if (directive_name === Directives.WHEN_ONLINE_MOVE_TO_AGENT) {
        tdclient.log = false;
        const agentDir = new DirMoveToAgent(tdclient);
        directive.whenOnlineOnly = true;
        agentDir.execute(directive, requestId, depId, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.REMOVE_CURRENT_BOT) {
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
      else if (directive_name === Directives.CHANGE_BOT) {
        console.log("changebot, requestId:", requestId);
        if (directive.parameter) {
          let botId = directive.parameter.trim();
          tdclient.log = true;
          tdclient.changeBot(requestId, botId, (err) => {
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
          console.error("changeBot no parameter error");
          process(nextDirective());
        }
      }
      else if (directive_name === Directives.WAIT) {
        let millis = 1000;
        if (directive.parameter) {
          const _millis = parseInt(directive.parameter.trim());
          if (!Number.isNaN(millis)) {
            millis = _millis;
          }
        }
        console.log("Wait millis:", millis);
        setTimeout( () => {
          process(nextDirective());
        }, millis);
      }
      else {
        console.log("Unknown directive:", directive.name);
        process(nextDirective());
      }
    }
    process(nextDirective());
    
    function nextDirective() {
      i += 1;
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
      else if (directive_name === Directives.WHEN_OFFLINE_HOURS) {
        tdclient.log = false;
        const offlineHoursDir = new DirOfflineHours(tdclient);
        offlineHoursDir.execute(directive, pipeline, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.WHEN_OFFLINE_HOURS_REPLACE_MESSAGE) {
        directive.replaceMessage = true;
        tdclient.log = false;
        const offlineHoursDir = new DirOfflineHours(tdclient);
        offlineHoursDir.execute(directive, pipeline, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.DEFLECT_TO_HELP_CENTER) {
        console.log("deflecttohelpcenter dir");
        const helpcenter_api_endpoint = "https://tiledesk-cms-server-prod.herokuapp.com";
        const helpDir = new DirDeflectToHelpCenter(helpcenter_api_endpoint, projectId);
        helpDir.execute(directive, pipeline, 3, () => {
          process(nextDirective());
        });
      }
      else {
        console.log("Unknown directive:", directive_name);
        console.log("Unknown directive:", Directives.WHEN_OFFLINE_HOURS);
        process(nextDirective());
      }
    }
    process(nextDirective());
    
    function nextDirective() {
      i += 1;
      if (i < directives.length) {
        let nextd = directives[i];
        return nextd;
      }
      else {
        return null;
      }
    }
  }
  
}

module.exports = { DirectivesChatbotPlug };