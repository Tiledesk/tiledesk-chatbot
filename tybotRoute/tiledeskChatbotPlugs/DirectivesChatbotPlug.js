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
const { DirIfOpenHours } = require('./directives/DirIfOpenHours');
// const { DirIfNotOpenHours } = require('./directives/DirIfNotOpenHours');
const { DirAssignFromFunction } = require('./directives/DirAssignFromFunction');
const { DirCondition } = require('./directives/DirCondition');
const { DirAssign } = require('./directives/DirAssign');

const { TiledeskChatbot } = require('../models/TiledeskChatbot');
const { DirIfOnlineAgents } = require('./directives/DirIfOnlineAgents');
const { DirReply } = require('./directives/DirReply');

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
      console.log("Message directives:", JSON.stringify(parsed_result));
      console.log("Message text ripped from directives:", parsed_result.text);
    }
    if (parsed_result && parsed_result.directives && parsed_result.directives.length > 0) {
      if (this.log) {console.log("Do not process more intents. Process directives and return");}
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

  async processDirectives(theend) {
    // console.log("Directives to process:", JSON.stringify(this.directives));
    this.theend = theend;
    const directives = this.directives;
    if (!directives || directives.length === 0) {
      if (this.log) { console.log("No directives to process."); }
      this.theend();
      return;
    }
    const supportRequest = this.supportRequest;
    const token = this.token;
    const API_URL = this.API_URL;
    const TILEBOT_ENDPOINT = this.TILEBOT_ENDPOINT;

    // const requestId = supportRequest.request_id
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
      log: this.log
    });

    this.context =  {
      projectId: projectId,
      token: token,
      supportRequest: supportRequest,
      requestId: supportRequest.request_id,
      TILEDESK_APIURL: API_URL,
      TILEBOT_ENDPOINT: TILEBOT_ENDPOINT,
      departmentId: depId,
      tdcache: tdcache,
      tdclient: tdclient,
      log: this.log
    }
    
    this.curr_directive_index = -1;
    if (this.log) { console.log("processing directives:", JSON.stringify(directives)); }
    
    const next_dir = await this.nextDirective(directives);
    if (this.log) { console.log("next_dir:", next_dir);}
    await this.process(next_dir);
  }

  async nextDirective(directives) {
    // console.log("....nextDirective() checkStep():");
    const go_on = await TiledeskChatbot.checkStep(
      this.context.tdcache, this.context.requestId, TiledeskChatbot.MAX_STEPS
    );
    const current_step = await TiledeskChatbot.currentStep(this.context.tdcache, this.context.requestId);
    // console.log("........nextDirective() currentStep:", current_step);
    if (!go_on) {
      // console.log("..nextDirective() Stopped!");
      return this.errorMessage("Request error: anomaly detection. MAX_STEPS exeeded.");
    }
    else {
      // console.log("Go on!");
    }
    this.curr_directive_index += 1;
    if (this.curr_directive_index < directives.length) {
      let nextd = directives[this.curr_directive_index];
      // console.log("nextd:", nextd);
      return nextd;
    }
    else {
      return null;
    }
  }

  errorMessage(message) {
    return {
      name: "message",
      action: {
        "_tdThenStop": true,
        text: message,
        attributes: {
          runtimeError: {
            message: message
          }
        }
      }
    }
  }

  async process(directive) {
    // console.log("process(directive):", JSON.stringify(directive));
    let context = this.context;
    if (directive) {
      if (context.log) { console.log("process(directive):", JSON.stringify(directive));}
    }
    let directive_name = null;
    if (directive && directive.name) {
      directive_name = directive.name.toLowerCase();
    }
    if (directive == null || (directive !== null && directive["name"] === undefined)) {
      if (context.log) { console.log("stop process(). directive is null", directive);}
      this.theend();
    }
    else if (directive_name === Directives.DEPARTMENT) {
      new DirDepartment(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.HMESSAGE) {
      new DirMessage(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.INTENT) {
      // console.log(".....DirIntent")
      new DirIntent(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        await process(next_dir);
      });
    }
    else if (directive_name === Directives.MESSAGE) {
      new DirMessage(context).execute(directive, async (stop) => {
        if (stop) {
          if (context.log) { console.log("Stopping Actions on:", directive);}
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.REPLY) {
      console.log("...DirReply");
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.IF_OPEN_HOURS) {
      new DirIfOpenHours(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.IF_ONLINE_AGENTS) {
      new DirIfOnlineAgents(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.FUNCTION_VALUE) {
      // console.log("...DirAssignFromFunction")
      new DirAssignFromFunction(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.CONDITION) {
      // console.log("...DirCondition");
      new DirCondition(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.ASSIGN) {
      // console.log("...DirAssign", context.log);
      new DirAssign(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.WHEN_OPEN) {
      // DEPRECATED
      const whenOpenDir = new DirWhenOpen(
        {
          tdclient: tdclient, // matches open hours
          log: false
        });
      whenOpenDir.execute(directive, directives, curr_directive_index, () => {
        process(nextDirective());
      });
    }
    else if (directive_name === Directives.WHEN_CLOSED) {
      // DEPRECATED
      const whenOpenDir = new DirWhenOpen(
        {
          tdclient: tdclient,
          checkOpen: false, // matches closed hours
          log: false
        });
      whenOpenDir.execute(directive, directives, curr_directive_index, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.IF_AGENTS) {
      // DEPRECATED
      const ifNoAgentsDir = new DirIfAvailableAgents(
        {
          tdclient: tdclient,
          checkAgents: true, // check available agents > 0
          log: false
        });
      ifNoAgentsDir.execute(directive, directives, curr_directive_index, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.IF_NO_AGENTS) {
      // DEPRECATED
      const ifNoAgentsDir = new DirIfAvailableAgents(
        {
          tdclient: tdclient,
          checkAgents: false, // check no available agents 
          log: false
        });
      ifNoAgentsDir.execute(directive, directives, curr_directive_index, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.AGENT) {
      console.log("...DirMoveToAgent");
      new DirMoveToAgent(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.WHEN_ONLINE_MOVE_TO_AGENT) { // DEPRECATED?
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
        agentDir.execute(directive, async () => {
          let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
        });
      }
      else {
        console.log("Warning. DepId null while calling 'WHEN_ONLINE_MOVE_TO_AGENT' directive")
        process(nextDirective());
      }
    }
    else if (directive_name === Directives.CLOSE) {
      // console.log("Exec close()")
      new DirClose(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.REMOVE_CURRENT_BOT) {
      new DirRemoveCurrentBot(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.REPLACE_BOT) {
      new DirReplaceBot(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.WAIT) {
      console.log("........ DirWait");
      new DirWait(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.LOCK_INTENT) {
      new DirLockIntent(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.UNLOCK_INTENT) {
      new DirUnlockIntent(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.FIRE_TILEDESK_EVENT) {
      new DirFireTiledeskEvent(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.SEND_EMAIL) {
      // console.log("...DirSendEmail");
      new DirSendEmail(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.DELETE) {
      // console.log("got delete dir...")
      new DirDeleteVariable(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else {
      //console.log("Unhandled Post-message Directive:", directive_name);
      let next_dir = await this.nextDirective(this.directives);
      this.process(next_dir);
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
      else if (directive_name === Directives.WHEN_OFFLINE_HOURS) { // DEPRECATED
        const offlineHoursDir = new DirOfflineHours(tdclient);
        offlineHoursDir.execute(directive, pipeline, () => {
          process(nextDirective());
        });
      }
      else if (directive_name === Directives.DISABLE_INPUT_TEXT) { // DEPRECATED => will change in a "message-option" --disableInput
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