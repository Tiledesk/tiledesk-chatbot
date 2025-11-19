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
    console.log(`(GAB) DirectivesChatbotPlug 0--> after processDirectives at :  ${new Date().getTime()}`)
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
    
    let start1 = new Date()
    const next_dir = await this.nextDirective(directives);
    let end1 = new Date()
    console.log(`(GAB) DirectivesChatbotPlug 1--> after processDirectives nextDirective at :  ${end1.getTime()}, diff: ${end1-start1}[ms]`)
  
    winston.debug("(DirectivesChatbotPlug) next_dir: ", next_dir);
    await this.process(next_dir);
  }

  async nextDirective(directives) {
    console.log(`(GAB) DirectivesChatbotPlug 0--> nextDirective at :  ${new Date().getTime()}`)
    let start1 = new Date()
    winston.debug("(DirectivesChatbotPlug) ....nextDirective() checkStep()");
    const go_on = await TiledeskChatbot.checkStep(this.context.tdcache, this.context.requestId, this.chatbot?.MAX_STEPS,  this.chatbot?.MAX_EXECUTION_TIME);
    let end1 = new Date()
    console.log(`(GAB) DirectivesChatbotPlug 1--> nextDirective at :  ${end1.getTime()}, diff: ${end1-start1}[ms]`)
  
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
    console.log(`(GAB) DirectivesChatbotPlug process 0--> after process at :  ${new Date().getTime()}`)
    let context = this.context;
    if (directive) {
      winston.verbose("(DirectivesChatbotPlug) directive['name']: " + directive["name"]);
    }
    let directive_name = null;
    if (directive && directive.name) {
      directive_name = directive.name.toLowerCase();
    }
    let start1 = new Date();
    if (directive && directive.action) {
        const action_id = directive.action["_tdActionId"];
        const locked_action_id = await this.chatbot.currentLockedAction(this.supportRequest.request_id);
        let end1 = new Date()
        console.log(`(GAB) DirectivesChatbotPlug process 1--> after chatbot.currentLockedAction at :  ${end1.getTime()}, diff: ${end1-start1}[ms]`)
        if ( locked_action_id && (locked_action_id !== action_id) ) {
          let start2 = new Date();
          let next_dir = await this.nextDirective(this.directives);
          let end2 = new Date()
          console.log(`(GAB) DirectivesChatbotPlug process 2--> after chatbot.currentLockedAction at :  ${end2.getTime()}, diff: ${end2-start2}[ms]`)
          this.process(next_dir);
          return;
        }
      
    }
    let start2 = new Date()
    if (directive == null || (directive !== null && directive["name"] === undefined)) {
      winston.debug("(DirectivesChatbotPlug) stop process(). directive is (null?): ", directive);
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
      new DirIntent(context).execute(directive, async (stop) => {
        if (stop) {
          winston.debug("(DirectivesChatbotPlug) DirIntent Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.MESSAGE) {
      new DirMessage(context).execute(directive, async (stop) => {
        if (stop) {
          winston.debug("(DirectivesChatbotPlug) DirIntent Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.REPLY) {
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.REPLY_V2) {
      new DirReplyV2(context).execute(directive, async (stop) => {
        if (stop) {
          winston.debug("(DirectivesChatbotPlug) DirIntent Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.DTMF_FORM) {
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.DTMF_MENU) {
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.BLIND_TRANSFER) {
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.SPEECH_FORM) {
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.PLAY_PROMPT) {
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.AUDIO_RECORD) {
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.RANDOM_REPLY) {
      new DirRandomReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.IF_OPEN_HOURS) {
      new DirIfOpenHours(context).execute(directive, async (stop) => {
        if (stop) {
          winston.debug("(DirectivesChatbotPlug) DirIfOpenHours Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.IF_ONLINE_AGENTS) {
      new DirIfOnlineAgents(context).execute(directive, async (stop) => {
        if (stop) {
          winston.debug("(DirectivesChatbotPlug) DirIfOnlineAgents Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.IF_ONLINE_AGENTS_V2) {
      new DirIfOnlineAgentsV2(context).execute(directive, async (stop) => {
        if (stop) {
          winston.debug("(DirectivesChatbotPlug) DirIfOnlineAgentsV2 Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.FUNCTION_VALUE) {
      new DirAssignFromFunction(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.CONDITION) { // DEPRECATED
      new DirCondition(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirCondition Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.JSON_CONDITION) {
      new DirJSONCondition(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirJSONCondition Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.ASSIGN) {
      new DirAssign(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.SET_ATTRIBUTE) {
      new DirSetAttribute(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.SET_ATTRIBUTE_V2) {
      new DirSetAttributeV2(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.AGENT) {
      new DirMoveToAgent(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.CLOSE) {
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
    else if (directive_name === Directives.REPLACE_BOT_V2) {
      new DirReplaceBotV2(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.REPLACE_BOT_V3) {
      new DirReplaceBotV3(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.WAIT) {
      let end2 = new Date();
      console.log(`(GAB) DirectivesChatbotPlug process 3--> before DirWait execute at :  ${end2.getTime()}`)
      new DirWait(context).execute(directive, async () => {
        let endWait = new Date()
        console.log(`(GAB) DirectivesChatbotPlug process 3--> after DirWait executed callback at :  ${endWait.getTime()}, diff: ${endWait-end2}[ms]`)
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
      new DirSendEmail(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.WEB_REQUEST) {
      new DirWebRequest(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.WEB_REQUEST_V2) {
      new DirWebRequestV2(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirWebRequestV2 Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.FORM) {
      new DirForm(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirForm Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.CAPTURE_USER_REPLY) {
      new DirCaptureUserReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.CODE) {
      new DirCode(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.DELETE) {
      new DirDeleteVariable(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.ASK_HELP_CENTER) {
      new DirDeflectToHelpCenter(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirDeflectToHelpCenter Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.ASK_GPT) {
      new DirAskGPT(context).execute(directive, async (stop) => {;
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirAskGPT Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.ASK_GPT_V2) {
      new DirAskGPTV2(context).execute(directive, async (stop) => {;
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirAskGPTV2 Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.ADD_KB_CONTENT) {
      new DirAddKbContent(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.GPT_TASK) {
      new DirGptTask(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirGptTask Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.AI_PROMPT) {
      new DirAiPrompt(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirAskGPTV2 Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.AI_CONDITION) {
      new DirAiCondition(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirAskGPTV2 Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.WHATSAPP_ATTRIBUTE) {
      new DirWhatsappByAttribute(context).execute(directive, async (stop) => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.SEND_WHATSAPP) {
      new DirSendWhatsapp(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirSendWhatsapp Stopping Actions on: ", directive);
          this.theend();
        } else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.QAPLA) {
      new DirQapla(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirQapla Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      })
    }
    else if (directive_name === Directives.MAKE) {
      new DirMake(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirMake Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      })
    }
    else if (directive_name === Directives.HUBSPOT) {
      new DirHubspot(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirHubspot Stopping Actions on: ", directive);
          this.theend();
        } else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      })
    }
    else if (directive_name === Directives.CUSTOMERIO) {
      new DirCustomerio(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      })
    }
    else if (directive_name === Directives.BREVO) {
      new DirBrevo(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      })
    }
    else if (directive_name === Directives.GPT_ASSISTANT) {
      new DirAssistant(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirAssistant Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.CONTACT_UPDATE) {
      new DirContactUpdate(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.CLEAR_TRANSCRIPT) {
      new DirClearTranscript(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.MOVE_TO_UNASSIGNED) {
      new DirMoveToUnassigned(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.CONNECT_BLOCK) {
      new DirConnectBlock(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.ADD_TAGS) {
      new DirAddTags(context).execute(directive, async (stop) => {
        if (stop == true) {
          winston.debug("(DirectivesChatbotPlug) DirAddTags Stopping Actions on: ", directive);
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.WEB_RESPONSE) {
      new DirWebResponse(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.FLOW_LOG) {
      new DirFlowLog(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      })
    }
    else {
      let next_dir = await this.nextDirective(this.directives);
      this.process(next_dir);
    }
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