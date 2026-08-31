const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot');
const { AnalyticsClient } = require('../observability/AnalyticsClient');
const winston = require('../utils/winston');

// The directive-name -> directive-class map. Built by directives/registry.js
// from the `static directiveNames` each directive class declares, so adding a
// directive no longer means editing this file.
const { directiveRegistry } = require('./directives/registry');

// Still referenced by the DEPRECATED processInlineDirectives() path below.
const { Directives } = require('./directives/Directives');
const { DirDeflectToHelpCenter } = require('./directives/agents/DirDeflectToHelpCenter');

class DirectivesChatbotPlug {

  /**
   * @example
   * const { DirectivesChatbotPlug } = require('./DirectivesChatbotPlug');
   * 
   */

  constructor(config) {
    this.supportRequest = config.supportRequest;
    this.API_ENDPOINT = config.API_ENDPOINT;
    this.TILEBOT_ENDPOINT = config.TILEBOT_ENDPOINT;
    this.token = config.token;
    this.HELP_CENTER_API_ENDPOINT = config.HELP_CENTER_API_ENDPOINT;
    this.tdcache = config.cache;
    this.directives = config.directives;
    this.reply = config.reply;
    this.chatbot = config.chatbot;
    this.message = config.message;
  }

  exec(pipeline) {
    let message = pipeline.message;
    // this.message = message;
    if (message.attributes && (message.attributes.directives == undefined || message.attributes.directives == false)) { // defaults to disabled
      pipeline.nextplug();
      return;
    }

    const message_text = message.text;
    winston.verbose("(DirectivesChatbotPlug) processing message: " + message_text);

    let parsed_result = TiledeskChatbotUtil.parseDirectives(message_text);

    winston.debug("(DirectivesChatbotPlug) Message directives: ", parsed_result);
    winston.debug("(DirectivesChatbotPlug) Message text ripped from directives: " + parsed_result.text);

    if (parsed_result && parsed_result.directives && parsed_result.directives.length > 0) {
      winston.verbose("(DirectivesChatbotPlug) Do not process more intents. Process directives and return");
      const text = parsed_result.text;
      message.text = text;
      this.directives = parsed_result.directives;
      this.processInlineDirectives(pipeline, () => {
        winston.verbose("(DirectivesChatbotPlug) End process directives.");
        pipeline.nextplug();
      });
    }
    else {
      pipeline.nextplug();
    }

  }

  async processDirectives(theend) {
    this.theend = theend;
    const directives = this.directives;
    if (!directives || directives.length === 0) {
      winston.verbose("(DirectivesChatbotPlug) No directives to process.");
      this.theend();
      return;
    }
    
    const supportRequest = this.supportRequest;    
    const token = this.token;
    const API_ENDPOINT = this.API_ENDPOINT;
    const TILEBOT_ENDPOINT = this.TILEBOT_ENDPOINT;

    let depId;
    if (supportRequest.department && supportRequest.department._id) {
      winston.debug("(DirectivesChatbotPlug) Setting depId: " + supportRequest.department._id);
      depId = supportRequest.department._id;
    }

    const projectId = supportRequest.id_project;
    const tdcache = this.tdcache;
    let tdclient = null;
    try {
      tdclient = new TiledeskClient({
        projectId: projectId,
        token: token,
        APIURL: API_ENDPOINT,
        APIKEY: "___"
      });
    }
    catch(err) {
      winston.error("(DirectivesChatbotPlug) An error occurred while creating TiledeskClient in DirectivesChatbotPlug: ", err);
    }

    this.context =  {
      projectId: projectId,
      chatbot: this.chatbot,
      message: this.message,
      token: token,
      supportRequest: supportRequest,
      reply: this.reply,
      requestId: supportRequest.request_id,
      API_ENDPOINT: API_ENDPOINT,
      TILEBOT_ENDPOINT: TILEBOT_ENDPOINT,
      departmentId: depId,
      tdcache: tdcache,
      HELP_CENTER_API_ENDPOINT: this.HELP_CENTER_API_ENDPOINT
    }
    winston.debug("(DirectivesChatbotPlug) this.context.departmentId: " + this.context.departmentId);
    
    this.curr_directive_index = -1;
    winston.verbose("(DirectivesChatbotPlug) processing directives...");
    
    const next_dir = await this.nextDirective(directives);
    winston.debug("(DirectivesChatbotPlug) next_dir: ", next_dir);
    await this.process(next_dir);
  }

  async nextDirective(directives) {
    winston.debug("(DirectivesChatbotPlug) ....nextDirective() checkStep()");
    const go_on = await TiledeskChatbot.checkStep(this.context.tdcache, this.context.requestId, this.chatbot?.MAX_STEPS,  this.chatbot?.MAX_EXECUTION_TIME);

    if (go_on.error) {
      // Only track published (production) runs (root/draft copy has no root_id).
      if (this.chatbot?.bot.root_id) {
        AnalyticsClient.track('agent.flow_error', this.context.projectId, {
          agent_id: this.chatbot?.bot.root_id,
          error_type:    go_on.error_code || 'runtime_error',
          error_message: go_on.error || null,
          step_count:    go_on.step_count || 0,
          intent_name:   this.context.reply?.attributes?.intent_info?.intent_name || null,
          request_id:    this.context.requestId || null
        });
      }
      winston.debug("(DirectivesChatbotPlug) go_on == false! nextDirective() Stopped!");
      return this.errorMessage(go_on.error); //"Request error: anomaly detection. MAX ACTIONS exeeded.");
    }
    this.curr_directive_index += 1;
    if (this.curr_directive_index < directives.length) {
      let nextd = directives[this.curr_directive_index];
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
        isInfo: true,
        text: message,
        attributes: {
          runtimeError: {
            message: message
          },
          subtype: "info"
        }
      }
    }
  }

  async process(directive) {

    const context = this.context;

    if (!directive || !directive.name) {
      winston.debug("(DirectivesChatbotPlug) stop process(). directive is null", directive);
      return this.theend();
    }

    const directive_name = directive.name.toLowerCase();

    // Controllo lock action
    if (directive.action) {
      const action_id = directive.action["_tdActionId"];
      const locked_action_id = await this.chatbot.currentLockedAction(this.supportRequest.request_id);
      if (locked_action_id && locked_action_id !== action_id) {
        const next_dir = await this.nextDirective(this.directives);
        return this.process(next_dir);
      }
    }

    const HandlerClass = directiveRegistry[directive_name];
    if (!HandlerClass) {
      const next_dir = await this.nextDirective(this.directives);
      return this.process(next_dir);
    }

    const handler = new HandlerClass(context);

    // Esegue l'handler e chiama next se non stop

    const blockStart = Date.now();
    handler.execute(directive, async (stop) => {
      // [analytics-debug] Trace the block_executed decision per directive so we can
      // see whether the event is emitted and why (missing root_id, draft, etc.).
      winston.debug("(DirectivesChatbotPlug) [analytics] block_executed decision:" +
        " directive_type=" + (directive.name || 'unknown') +
        " block_id=" + (directive.action?.["_tdActionId"] || '<empty>') +
        " root_id=" + (this.context.chatbot?.bot?.root_id || '<none>') +
        " draft=" + (this.context.supportRequest?.draft) +
        " stop=" + stop +
        " willEmit=" + (!!this.context.chatbot?.bot?.root_id));
      // Only track published (production) runs (root/draft copy has no root_id).
      if (this.context.chatbot?.bot.root_id) {
        AnalyticsClient.track('agent.block_executed', this.context.projectId, {
          agent_id:       this.context.chatbot?.bot.root_id,
          block_id:       directive.action?.["_tdActionId"] || '',
          block_name:     directive.action?.["_tdActionTitle"] || directive.action?.name || 'unnamed',
          directive_type: directive.name || 'unknown',
          intent_id:      this.context.chatbot?._lastIntentId || '',
          intent_name:    this.context.reply?.attributes?.intent_info?.intent_name || null,
          duration_ms:    Date.now() - blockStart,
          success:        !stop,
          request_id:     this.context.requestId || null
        });
      }
      if (stop) {
        winston.debug(`(DirectivesChatbotPlug) Stopping Actions on:`, directive);
        return this.theend();
      }
      const next_dir = await this.nextDirective(this.directives);
      let process_next_dir = await this.process(next_dir);
      return process_next_dir;
    });
  }

  // DEPRECATED
  processInlineDirectives(pipeline, theend) {
    const directives = this.directives;
    if (!directives || directives.length === 0) {
      winston.verbose("(DirectivesChatbotPlug) No directives to process.");
      return;
    }
    const supportRequest = this.supportRequest;
    const token = this.token;
    const API_ENDPOINT = this.API_ENDPOINT;
    // const requestId = supportRequest.request_id
    // let depId;
    // if (supportRequest.department && supportRequest.department._id) {
    //   depId = supportRequest.department._id;
    // }
    const projectId = supportRequest.id_project;
    const tdclient = new TiledeskClient({
      projectId: projectId,
      token: token,
      APIURL: API_ENDPOINT,
      APIKEY: "___"
    });
    let i = -1;
    winston.debug("(DirectivesChatbotPlug) processing Inline directives: ", directives);
    const process = (directive) => {
      if (directive) {
        winston.debug("(DirectivesChatbotPlug) __directive.name: " + directive.name);
      }
      let directive_name = null;
      if (directive && directive.name) {
        directive_name = directive.name.toLowerCase();
      }
      if (directive == null) {
        theend();
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
