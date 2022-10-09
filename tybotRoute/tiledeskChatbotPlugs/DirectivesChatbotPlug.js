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



  moveToDepartment(tdclient, requestId, depName, callback) {
    tdclient.getAllDepartments((err, deps) => {
      console.log("deps:", deps, err);
      if (err) {
        console.error("getAllDepartments() error:", err);
        callback(err);
        return;
      }
      let dep = null;
      for (i = 0; i < deps.length; i++) {
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
      if (this.log) { console.log("No directives to process."); }
      theend();
      return;
    }
    const supportRequest = this.supportRequest;
    const token = this.token;
    const API_URL = this.API_URL;

    const requestId = supportRequest.request_id
    const depId = supportRequest.department._id;
    //const depId = supportRequest.attributes.departmentId;
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

    let i = -1;
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
        console.log("department:", dep_name);
        moveToDepartment(tdclient, requestId, dep_name, () => {
          console.log("moved to department:", dep_name);
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
          console.log("Message:", message)
          tdclient.sendSupportMessage(requestId, message, () => {
            process(nextDirective());
          });
        }
      }
      else if (directive_name === Directives.MESSAGE) {
        const messageDir = new DirMessage();
        messageDir.execute(directive, projectId, requestId, token, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.AGENT) {
        tdclient.log = false;
        const agentDir = new DirMoveToAgent(tdclient);
        directive.whenOnlineOnly = false;
        agentDir.execute(directive, requestId, depId, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.WHEN_ONLINE_MOVE_TO_AGENT) {
        // TODO remove this directive and
        // improve: \agent -whenonline
        const agentDir = new DirMoveToAgent(tdclient);
        directive.whenOnlineOnly = true;
        agentDir.execute(directive, requestId, depId, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.REMOVE_CURRENT_BOT) {
        tdclient.removeCurrentBot(requestId, (err) => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.REPLACE_BOT) {
        console.log("REPLACE_BOT, requestId:", requestId);
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
      else {
        //console.log("Unhandled Post-message Directive:", directive_name);
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

  processInlineDirectives(pipeline, theend) {
    const directives = this.directives;
    if (!directives || directives.length === 0) {
      console.log("No directives to process.");
      return;
    }
    const supportRequest = this.supportRequest;
    const token = this.token;
    const API_URL = this.API_URL;

    //console.log("supportRequest", supportRequest)
    const requestId = supportRequest.request_id
    const depId = supportRequest.department._id;
    //const depId = supportRequest.attributes.departmentId;
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