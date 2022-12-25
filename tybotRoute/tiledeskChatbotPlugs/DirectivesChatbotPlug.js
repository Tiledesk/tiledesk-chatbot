const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { DirDeflectToHelpCenter } = require('./directives/DirDeflectToHelpCenter');
const { DirOfflineHours } = require('./directives/DirOfflineHours');
const { DirMoveToAgent } = require('./directives/DirMoveToAgent');
const { DirMessage } = require('./directives/DirMessage');
const { DirWait } = require('./directives/DirWait');
const { DirReplaceBot } = require('./directives/DirReplaceBot');
const { DirLockIntent } = require('./directives/DirLockIntent');
const { DirUnlockIntent } = require('./directives/DirUnlockIntent');
const { DirDepartment } = require('./directives/DirDepartment');
const { DirIntent } = require('./directives/DirIntent');
const { DirWhenOpen } = require('./directives/DirWhenOpen');
const { DirDisableInputText } = require('./directives/DirDisableInputText');
const { DirClose } = require('./directives/DirClose');
const { DirIfAvailableAgents } = require('./directives/DirIfAvailableAgents');
const { DirFireTiledeskEvent } = require('./directives/DirFireTiledeskEvent');
const { DirSendEmail } = require('./directives/DirSendEmail');
const { Directives } = require('./directives/Directives');

class DirectivesChatbotPlug {

  /**
   * @example
   * const { DirectivesChatbotPlug } = require('./DirectivesChatbotPlug');
   * 
   */

  constructor(config) {
    this.supportRequest = config.supportRequest;
    this.API_URL = config.TILEDESK_API_ENDPOINT;
    this.TILEBOT_ENDPOINT = config.TILEBOT_ENDPOINT;
    this.token = config.token;
    this.log = config.log;
    this.HELP_CENTER_API_ENDPOINT = config.HELP_CENTER_API_ENDPOINT;
    this.tdcache = config.cache;
  }

  exec(pipeline) {
    let message = pipeline.message;
    if (message.attributes && (message.attributes.directives == undefined || message.attributes.directives == false)) { // defaults to disabled
      pipeline.nextplug();
      return;
    }
    const message_text = message.text;
    if (this.log) { console.log("processing message:", message_text); }
    let parsed_result = TiledeskChatbotUtil.parseDirectives(message_text);
    if (this.log) {
      console.log("Message directives:", parsed_result);
      console.log("Message text ripped from directives:", parsed_result.text);
    }
    if (parsed_result && parsed_result.directives && parsed_result.directives.length > 0) {
      // do not process more intents. Process directives and return
      const text = parsed_result.text;
      message.text = text;
      this.directives = parsed_result.directives;
      this.processInlineDirectives(pipeline, () => {
        if (this.log) { console.log("End process directives."); }
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

  processDirectives(theend) {
    // if (this.log) { console.log("Directives on message:", JSON.stringify(message)); }
    const directives = this.directives;
    if (!directives || directives.length === 0) {
      if (this.log) { console.log("No directives to process."); }
      theend();
      return;
    }
    const supportRequest = this.supportRequest;
    const token = this.token;
    const API_URL = this.API_URL;
    const TILEBOT_ENDPOINT = this.TILEBOT_ENDPOINT;

    const requestId = supportRequest.request_id
    let depId;
    if (supportRequest.department && supportRequest.department._id) {
      depId = supportRequest.department._id;
    }
    const projectId = supportRequest.id_project;
    const tdcache = this.tdcache;
    //console.log("TDCACHE:", this.tdcache, tdcache)
    const tdclient = new TiledeskClient({
      projectId: projectId,
      token: token,
      APIURL: API_URL,
      APIKEY: "___",
      log: false
    });

    let curr_directive_index = -1;
    if (this.log) { console.log("processing directives:", directives); }
    function process(directive) {
      if (directive) {
        //console.log("directive:", directive);
        //console.log("directive.name:", directive.name);
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
        const departmentDir = new DirDepartment({tdclient: tdclient, log: false});
        departmentDir.execute(requestId, dep_name, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.HMESSAGE) {
        //tdclient.log = true;
        if (directive.parameter) {
          let text = directive.parameter.trim();
          let message = {
            sender: "system22", // bot doesn't reply to himself
            text: text,
            attributes: {
              subtype: "info"
            }
          };
          tdclient.sendSupportMessage(requestId, message, () => {
            process(nextDirective());
          });
        }
      }
      else if (directive_name === Directives.INTENT) {
        const intentDir = new DirIntent(
          {
            API_ENDPOINT: API_URL,
            TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
            log: false
          }
        );
        intentDir.execute(directive, projectId, requestId, token, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.MESSAGE) {
        const messageDir = new DirMessage(
          {
            API_ENDPOINT: API_URL,
            TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
            log: false
          }
        );
        messageDir.execute(directive, projectId, requestId, token, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.WHEN_OPEN) {
        const whenOpenDir = new DirWhenOpen(
          {
            tdclient: tdclient, // matches open hours
            log: true
          });
        whenOpenDir.execute(directive, directives, curr_directive_index, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.WHEN_CLOSED) {
        const whenOpenDir = new DirWhenOpen(
          {
            tdclient: tdclient,
            checkOpen: false, // matches closed hours
            log: true
          });
        whenOpenDir.execute(directive, directives, curr_directive_index, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.IF_AGENTS) {
        const ifNoAgentsDir = new DirIfAvailableAgents(
          {
            tdclient: tdclient,
            checkAgents: true, // check available agents > 0
            log: false
          });
        ifNoAgentsDir.execute(directive, directives, curr_directive_index, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.IF_NO_AGENTS) {
        const ifNoAgentsDir = new DirIfAvailableAgents(
          {
            tdclient: tdclient,
            checkAgents: false, // check no available agents
            log: false
          });
        ifNoAgentsDir.execute(directive, directives, curr_directive_index, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.AGENT) {
        if (depId) {
          const agentDir = new DirMoveToAgent(tdclient);
          directive.whenOnlineOnly = false;
          agentDir.execute(directive, requestId, depId, () => {
            process(nextDirective());
          });  
        }
        else {
          console.log("Warning. DepId null while calling 'AGENT' directive")
          process(nextDirective());
        }
      }
      else if (directive_name === Directives.CLOSE) {
        const closeDir = new DirClose({tdclient: tdclient});
        closeDir.execute(directive, requestId, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.WHEN_ONLINE_MOVE_TO_AGENT) {
        if (depId) {
          const agentDir = new DirMoveToAgent(tdclient);
          directive.whenOnlineOnly = true;
          agentDir.execute(directive, requestId, depId, () => {
            process(nextDirective());
          });
        }
        else {
          console.log("Warning. DepId null while calling 'WHEN_ONLINE_MOVE_TO_AGENT' directive")
          process(nextDirective());
        }
      }
      else if (directive_name === Directives.REMOVE_CURRENT_BOT) {
        tdclient.removeCurrentBot(requestId, (err) => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.REPLACE_BOT) {
        new DirReplaceBot(tdclient).execute(directive, requestId, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.WAIT) {
        new DirWait().execute(directive, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.LOCK_INTENT) {
        new DirLockIntent(tdcache).execute(directive, requestId, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.UNLOCK_INTENT) {
        new DirUnlockIntent(tdcache).execute(requestId, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.FIRE_TILEDESK_EVENT) {
        new DirFireTiledeskEvent({tdclient: tdclient}).execute(directive, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.SEND_EMAIL) {
        new DirSendEmail({tdclient: tdclient}).execute(directive, requestId, () => {
          process(nextDirective());
        });
      }
      else {
        //console.log("Unhandled Post-message Directive:", directive_name);
        process(nextDirective());
      }
    }
    process(nextDirective());

    function nextDirective() {
      curr_directive_index += 1;
      if (curr_directive_index < directives.length) {
        let nextd = directives[curr_directive_index];
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
    // const requestId = supportRequest.request_id
    // let depId;
    // if (supportRequest.department && supportRequest.department._id) {
    //   depId = supportRequest.department._id;
    // }
    const projectId = supportRequest.id_project;
    const tdclient = new TiledeskClient({
      projectId: projectId,
      token: token,
      APIURL: API_URL,
      APIKEY: "___",
      log: false
    });
    let i = -1;
    if (this.log) { console.log("processing Inline directives:", directives); }
    const process = (directive) => {
      if (directive) {
        if (this.log) {console.log("__directive.name:", directive.name);}
      }
      let directive_name = null;
      if (directive && directive.name) {
        directive_name = directive.name.toLowerCase();
      }
      if (directive == null) {
        theend();
      }
      else if (directive_name === Directives.WHEN_OFFLINE_HOURS) {
        const offlineHoursDir = new DirOfflineHours(tdclient);
        offlineHoursDir.execute(directive, pipeline, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.DISABLE_INPUT_TEXT) {
        const disableInputTextDir = new DirDisableInputText();
        disableInputTextDir.execute(directive, pipeline, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.DEFLECT_TO_HELP_CENTER) {
        const helpDir = new DirDeflectToHelpCenter({HELP_CENTER_API_ENDPOINT: this.HELP_CENTER_API_ENDPOINT, projectId: projectId});
        helpDir.execute(directive, pipeline, 3, () => {
          process(nextDirective());
        });
      }
      else {
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