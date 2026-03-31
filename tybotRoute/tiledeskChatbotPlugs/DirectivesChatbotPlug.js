const { TiledeskChatbotUtil } = require('@tiledesk/tiledesk-chatbot-util');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { DirDeflectToHelpCenter } = require('./directives/DirDeflectToHelpCenter');
const { DirMoveToAgent } = require('./directives/DirMoveToAgent');
const { DirMessage } = require('./directives/DirMessage');
const { DirWait } = require('./directives/DirWait');
const { DirReplaceBot } = require('./directives/DirReplaceBot');
const { DirRemoveCurrentBot } = require('./directives/DirRemoveCurrentBot');
const { DirLockIntent } = require('./directives/DirLockIntent');
const { DirUnlockIntent } = require('./directives/DirUnlockIntent');
const { DirDepartment } = require('./directives/DirDepartment');
const { DirIntent } = require('./directives/DirIntent');
// const { DirWhenOpen } = require('./directives/DirWhenOpen'); // DEPRECATED
const { DirDisableInputText } = require('./directives/DirDisableInputText');
const { DirClose } = require('./directives/DirClose');
// const { DirIfAvailableAgents } = require('./directives/DirIfAvailableAgents'); // DEPRECATED
const { DirFireTiledeskEvent } = require('./directives/DirFireTiledeskEvent');
const { DirSendEmail } = require('./directives/DirSendEmail');
const { Directives } = require('./directives/Directives');
const { DirDeleteVariable } = require('./directives/DirDeleteVariable');
const { DirIfOpenHours } = require('./directives/DirIfOpenHours');
const { DirAssignFromFunction } = require('./directives/DirAssignFromFunction');
const { DirCondition } = require('./directives/DirCondition');
const { DirJSONCondition } = require('./directives/DirJSONCondition');
const { DirAssign } = require('./directives/DirAssign');
const { DirSetAttribute } = require('./directives/DirSetAttribute');
const { DirSetAttributeV2 } = require('./directives/DirSetAttributeV2');
const { DirWebRequest } = require('./directives/DirWebRequest');
const { DirWebRequestV2 } = require('./directives/DirWebRequestV2');
const { DirCode } = require('./directives/DirCode');
const { DirWhatsappByAttribute } = require('./directives/DirWhatsappByAttribute');
const { DirAskGPT } = require('./directives/DirAskGPT');
const { DirQapla } = require('./directives/DirQapla');

const { TiledeskChatbot } = require('../engine/TiledeskChatbot');
const { DirIfOnlineAgents } = require('./directives/DirIfOnlineAgents');
const { DirReply } = require('./directives/DirReply');
const { DirRandomReply } = require('./directives/DirRandomReply');
const { DirGptTask } = require('./directives/DirGptTask');
const { DirForm } = require('./directives/DirForm');
const { DirCaptureUserReply } = require('./directives/DirCaptureUserReply');
const { DirMake } = require('./directives/DirMake');
const { DirReplaceBotV2 } = require('./directives/DirReplaceBotV2');
const { DirHubspot } = require('./directives/DirHubspot');
const { DirCustomerio } = require('./directives/DirCustomerio');
const { DirBrevo } = require('./directives/DirBrevo');
const { DirAskGPTV2 } = require('./directives/DirAskGPTV2');
const { DirAssistant } = require('./directives/DirAssistant');
const { DirReplyV2 } = require('./directives/DirReplyV2');
const { DirIfOnlineAgentsV2 } = require('./directives/DirIfOnlineAgentsV2');
const { DirContactUpdate } = require('./directives/DirContactUpdate');
const { DirClearTranscript } = require('./directives/DirClearTranscript');
const { DirMoveToUnassigned } = require('./directives/DirMoveToUnassigned');
const { DirAddTags } = require('./directives/DirAddTags');
const { DirSendWhatsapp } = require('./directives/DirSendWhatsapp');
const { DirReplaceBotV3 } = require('./directives/DirReplaceBotV3');
const { DirAiTask, DirAiPrompt } = require('./directives/DirAiPrompt');
const { DirWebResponse } = require('./directives/DirWebResponse');
const { DirConnectBlock } = require('./directives/DirConnectBlock');
const { DirAiCondition } = require('./directives/DirAiCondition');

const winston = require('../utils/winston');
const { DirFlowLog } = require('./directives/DirFlowLog');
const { DirAddKbContent } = require('./directives/DirAddKbContent');
const { DirIteration } = require('./directives/DirIteration');

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

    // Mappa semplice directive_name -> classe
    const handlers = {
      [Directives.DEPARTMENT]: DirDepartment,
      [Directives.HMESSAGE]: DirMessage,
      [Directives.INTENT]: DirIntent,
      [Directives.MESSAGE]: DirMessage,
      [Directives.REPLY]: DirReply,
      [Directives.REPLY_V2]: DirReplyV2,
      [Directives.DTMF_FORM]: DirReply,
      [Directives.DTMF_MENU]: DirReply,
      [Directives.BLIND_TRANSFER]: DirReply,
      [Directives.SPEECH_FORM]: DirReply,
      [Directives.PLAY_PROMPT]: DirReply,
      [Directives.AUDIO_RECORD]: DirReply,
      [Directives.RANDOM_REPLY]: DirRandomReply,
      [Directives.IF_OPEN_HOURS]: DirIfOpenHours,
      [Directives.IF_ONLINE_AGENTS]: DirIfOnlineAgents,
      [Directives.IF_ONLINE_AGENTS_V2]: DirIfOnlineAgentsV2,
      [Directives.FUNCTION_VALUE]: DirAssignFromFunction,
      [Directives.JSON_CONDITION]: DirJSONCondition,
      [Directives.ASSIGN]: DirAssign,
      [Directives.SET_ATTRIBUTE]: DirSetAttribute,
      [Directives.SET_ATTRIBUTE_V2]: DirSetAttributeV2,
      [Directives.AGENT]: DirMoveToAgent,
      [Directives.CLOSE]: DirClose,
      [Directives.REMOVE_CURRENT_BOT]: DirRemoveCurrentBot,
      [Directives.REPLACE_BOT]: DirReplaceBot,
      [Directives.REPLACE_BOT_V2]: DirReplaceBotV2,
      [Directives.REPLACE_BOT_V3]: DirReplaceBotV3,
      [Directives.WAIT]: DirWait,
      [Directives.LOCK_INTENT]: DirLockIntent,
      [Directives.UNLOCK_INTENT]: DirUnlockIntent,
      [Directives.FIRE_TILEDESK_EVENT]: DirFireTiledeskEvent,
      [Directives.SEND_EMAIL]: DirSendEmail,
      [Directives.WEB_REQUEST]: DirWebRequest,
      [Directives.WEB_REQUEST_V2]: DirWebRequestV2,
      [Directives.FORM]: DirForm,
      [Directives.CAPTURE_USER_REPLY]: DirCaptureUserReply,
      [Directives.CODE]: DirCode,
      [Directives.DELETE]: DirDeleteVariable,
      [Directives.ASK_HELP_CENTER]: DirDeflectToHelpCenter,
      [Directives.ASK_GPT]: DirAskGPT,
      [Directives.ASK_GPT_V2]: DirAskGPTV2,
      [Directives.ADD_KB_CONTENT]: DirAddKbContent,
      [Directives.GPT_TASK]: DirGptTask,
      [Directives.AI_PROMPT]: DirAiPrompt,
      [Directives.AI_CONDITION]: DirAiCondition,
      [Directives.WHATSAPP_ATTRIBUTE]: DirWhatsappByAttribute,
      [Directives.SEND_WHATSAPP]: DirSendWhatsapp,
      [Directives.QAPLA]: DirQapla,
      [Directives.MAKE]: DirMake,
      [Directives.HUBSPOT]: DirHubspot,
      [Directives.CUSTOMERIO]: DirCustomerio,
      [Directives.BREVO]: DirBrevo,
      [Directives.GPT_ASSISTANT]: DirAssistant,
      [Directives.CONTACT_UPDATE]: DirContactUpdate,
      [Directives.CLEAR_TRANSCRIPT]: DirClearTranscript,
      [Directives.MOVE_TO_UNASSIGNED]: DirMoveToUnassigned,
      [Directives.CONNECT_BLOCK]: DirConnectBlock,
      [Directives.ADD_TAGS]: DirAddTags,
      [Directives.WEB_RESPONSE]: DirWebResponse,
      [Directives.FLOW_LOG]: DirFlowLog,
      [Directives.ITERATION]: DirIteration,
    };

    const HandlerClass = handlers[directive_name];
    if (!HandlerClass) {
      const next_dir = await this.nextDirective(this.directives);
      return this.process(next_dir);
    }

    const handler = new HandlerClass(context);

    // Esegue l'handler e chiama next se non stop

    handler.execute(directive, async (stop) => {
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