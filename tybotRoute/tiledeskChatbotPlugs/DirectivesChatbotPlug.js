const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { DirDeflectToHelpCenter } = require('./directives/DirDeflectToHelpCenter');
const { DirOfflineHours } = require('./directives/DirOfflineHours'); // DEPRECATED
const { DirMoveToAgent } = require('./directives/DirMoveToAgent');
const { DirMessage } = require('./directives/DirMessage');
const { DirWait } = require('./directives/DirWait');
const { DirReplaceBot } = require('./directives/DirReplaceBot');
const { DirRemoveCurrentBot } = require('./directives/DirRemoveCurrentBot');
const { DirLockIntent } = require('./directives/DirLockIntent');
const { DirUnlockIntent } = require('./directives/DirUnlockIntent');
const { DirDepartment } = require('./directives/DirDepartment');
const { DirIntent } = require('./directives/DirIntent');
const { DirWhenOpen } = require('./directives/DirWhenOpen'); // DEPRECATED
const { DirDisableInputText } = require('./directives/DirDisableInputText');
const { DirClose } = require('./directives/DirClose');
const { DirIfAvailableAgents } = require('./directives/DirIfAvailableAgents'); // DEPRECATED
const { DirFireTiledeskEvent } = require('./directives/DirFireTiledeskEvent');
const { DirSendEmail } = require('./directives/DirSendEmail');
const { Directives } = require('./directives/Directives');
const { DirDeleteVariable } = require('./directives/DirDeleteVariable');
const { DirIfOpenHours} = require('./directives/DirIfOpenHours');
const { DirIfNotOpenHours} = require('./directives/DirIfNotOpenHours');

const { TiledeskChatbot } = require('../models/TiledeskChatbot');

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
    this.directives = config.directives;
  }

  exec(pipeline) {
    let message = pipeline.message;
    // this.message = message;
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
    // console.log("Directives to process:", JSON.stringify(this.directives));
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
    const tdclient = new TiledeskClient({
      projectId: projectId,
      token: token,
      APIURL: API_URL,
      APIKEY: "___",
      log: false
    });

    let context =  {
      projectId: projectId,
      token: token,
      supportRequest: supportRequest,
      requestId: supportRequest.request_id,
      TILEDESK_APIURL: API_URL,
      TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
      departmentId: depId,
      tdcache: tdcache,
      log: false
    }
    
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
        // let dep_name = "default department";
        // if (directive.parameter) {
        //   dep_name = directive.parameter;
        // }
        const departmentDir = new DirDepartment(
          {
            tdclient: tdclient,
            requestId: requestId,
            log: false
          });
        departmentDir.execute(directive, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.HMESSAGE) {
        const messageDir = new DirMessage(
          {
            API_ENDPOINT: API_URL,
            TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
            log: false,
            projectId: projectId,
            requestId: requestId,
            token: token
          }
        );
        messageDir.execute(directive, async () => {
          process(nextDirective());
        });
        
        // if (directive.parameter) {
        //   let text = directive.parameter.trim();
        //   let message = {
        //     sender: "system22", // bot doesn't reply to himself
        //     text: text,
        //     attributes: {
        //       subtype: "info"
        //     }
        //   };
        //   tdclient.sendSupportMessage(requestId, message, () => {
        //     process(nextDirective());
        //   });
        // }

      }
      else if (directive_name === Directives.INTENT) {
        const intentDir = new DirIntent(
          {
            API_ENDPOINT: API_URL,
            TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
            log: false,
            supportRequest: supportRequest,
            token: token
          }
        );
        intentDir.execute(directive, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.MESSAGE) {
        const messageDir = new DirMessage(
          {
            API_ENDPOINT: API_URL,
            TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
            log: false,
            projectId: projectId,
            requestId: requestId,
            token: token
          }
        );
        messageDir.execute(directive, async () => {
          // const requestVariables = 
          //   await TiledeskChatbot.allParametersStatic(
          //     tdcache, requestId
          //   );
          //   console.log("message executed.", requestVariables);
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.IF_OPEN_HOURS) {
        // const intentDir = new DirIntent(
        //   {
        //     API_ENDPOINT: API_URL,
        //     TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
        //     log: false,
        //     supportRequest: supportRequest,
        //     token: token
        //   }
        // );

        const ifOpenHours = new DirIfOpenHours(context);
          // {
          //   tdclient: tdclient,
          //   intentDir: intentDir,
          //   log: false
          // });
        ifOpenHours.execute(directive, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.IF_NOT_OPEN_HOURS) {
        // const intentDir = new DirIntent(
        //   {
        //     API_ENDPOINT: API_URL,
        //     TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
        //     log: false,
        //     supportRequest: supportRequest,
        //     token: token
        //   }
        // );
        const ifNotOpenHours = new DirIfNotOpenHours(context);
          // {
          //   tdclient: tdclient,
          //   intentDir: intentDir,
          //   log: false
          // });
        ifNotOpenHours.execute(directive, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.WHEN_OPEN) { // DEPRECATED
        const whenOpenDir = new DirWhenOpen(
          {
            tdclient: tdclient, // matches open hours
            log: false
          });
        whenOpenDir.execute(directive, directives, curr_directive_index, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.WHEN_CLOSED) { // DEPRECATED
        const whenOpenDir = new DirWhenOpen(
          {
            tdclient: tdclient,
            checkOpen: false, // matches closed hours
            log: false
          });
        whenOpenDir.execute(directive, directives, curr_directive_index, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.IF_AGENTS) { // DEPRECATED
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
      else if (directive_name === Directives.IF_NO_AGENTS) { // DEPRECATED
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
          const agentDir = new DirMoveToAgent(
            {
              tdclient: tdclient,
              requestId: requestId,
              depId: depId
            }
          );
          if (!directive.body) {
            directive.action = {}
            directive.action.body = {
              whenOnlineOnly: false
            }
          }
          agentDir.execute(directive, () => {
            process(nextDirective());
          });  
        }
        else {
          console.log("Warning. DepId null while calling 'AGENT' directive")
          process(nextDirective());
        }
      }
      else if (directive_name === Directives.WHEN_ONLINE_MOVE_TO_AGENT) {
        if (depId) {
          const agentDir = new DirMoveToAgent(
            {
              tdclient: tdclient,
              requestId: requestId,
              depId: depId
            }
          );
          if (!directive.body) {
            directive.action = {}
            directive.action.body = {
              whenOnlineOnly: true
            }
          }
          agentDir.execute(directive, () => {
            process(nextDirective());
          });
        }
        else {
          console.log("Warning. DepId null while calling 'WHEN_ONLINE_MOVE_TO_AGENT' directive")
          process(nextDirective());
        }
      }
      else if (directive_name === Directives.CLOSE) {
        // console.log("Exec close()")
        const closeDir = new DirClose(
          {
            tdclient: tdclient,
            requestId: requestId
          });
        closeDir.execute(directive, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.REMOVE_CURRENT_BOT) {
        new DirRemoveCurrentBot({
          tdclient: tdclient,
          requestId: requestId
        }).execute(directive, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.REPLACE_BOT) {
        new DirReplaceBot({
          tdclient: tdclient,
          requestId: requestId
        }).execute(directive, () => {
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
        new DirFireTiledeskEvent(
          {
            tdclient: tdclient
          }).execute(directive, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.SEND_EMAIL) {
        new DirSendEmail(
          {
            tdclient: tdclient,
            tdcache: tdcache,
            requestId: requestId
          }).execute(directive, () => {
            process(nextDirective());
        });
      }
      else if (directive_name === Directives.DELETE) {
        // console.log("got delete dir...")
        new DirDeleteVariable(
          {
            tdclient: tdclient,
            tdcache: tdcache,
            requestId: requestId
          }).execute(directive, async () => {
            const requestVariables = 
            await TiledeskChatbot.allParametersStatic(
              tdcache, requestId
            );
            // console.log("delete executed.",directive, requestVariables);
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