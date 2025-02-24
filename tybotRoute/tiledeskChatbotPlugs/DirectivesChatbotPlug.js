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

const { TiledeskChatbot } = require('../models/TiledeskChatbot');
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
    this.log = config.log;
    this.HELP_CENTER_API_ENDPOINT = config.HELP_CENTER_API_ENDPOINT;
    this.tdcache = config.cache;
    this.directives = config.directives;
    this.reply = config.reply;
    this.chatbot = config.chatbot;
    this.message = config.message;
    // console.log("We have the support request:", JSON.stringify(this.supportRequest))
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
    this.theend = theend;
    const directives = this.directives;
    if (!directives || directives.length === 0) {
      if (this.log) { console.log("No directives to process."); }
      this.theend();
      return;
    }
    const supportRequest = this.supportRequest;
    // console.log("supportRequest is:", JSON.stringify(supportRequest))
    
    const token = this.token;
    const API_ENDPOINT = this.API_ENDPOINT;
    const TILEBOT_ENDPOINT = this.TILEBOT_ENDPOINT;

    // const requestId = supportRequest.request_id
    let depId;
    if (supportRequest.department && supportRequest.department._id) {
      if (this.log) {console.log("setting depId:", supportRequest.department._id);}
      depId = supportRequest.department._id;
      if (this.log) {console.log("depId is:", depId);}
    }
    const projectId = supportRequest.id_project;
    const tdcache = this.tdcache;
    let tdclient = null;
    try {
      tdclient = new TiledeskClient({
        projectId: projectId,
        token: token,
        APIURL: API_ENDPOINT,
        APIKEY: "___",
        log: this.log
      });
    }
    catch(err) {
      console.log("An error occurred while creating TiledeskClient in DirectivesChatbotPlug:", err);
    }

    console.log("request: ", request);
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
      HELP_CENTER_API_ENDPOINT: this.HELP_CENTER_API_ENDPOINT,
      log: this.log
    }
    if (this.log) {console.log("this.context.departmentId is:", this.context.departmentId);}
    
    this.curr_directive_index = -1;
    if (this.log) { console.log("processing directives...");}
    
    const next_dir = await this.nextDirective(directives);
    if (this.log) { console.log("next_dir:", JSON.stringify(next_dir));}
    await this.process(next_dir);
  }

  async nextDirective(directives) {
    if (this.log) {console.log("....nextDirective() checkStep():");}
    const go_on = await TiledeskChatbot.checkStep(
      this.context.tdcache, this.context.requestId, this.chatbot?.MAX_STEPS,  this.chatbot?.MAX_EXECUTION_TIME, this.log
    );
    // const current_step = await TiledeskChatbot.currentStep(this.context.tdcache, this.context.requestId);
    // if (this.log) {console.log("........nextDirective() currentStep:", current_step);}
    if (go_on.error) {
      if (this.log) {console.log("go_on == false! nextDirective() Stopped!");}
      return this.errorMessage(go_on.error); //"Request error: anomaly detection. MAX ACTIONS exeeded.");
    }
    // else if (go_on == 2) {
    //   return null;
    // }
    else { // continue with the next directive
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
    // console.log(".process(directive):", JSON.stringify(directive));
    let context = this.context;
    // console.log(".this.context.reply", JSON.stringify(this.context.reply));
    if (directive) {
      if (context.log) {
        console.log("directive['name']:", directive["name"]);
      }
    }
    let directive_name = null;
    if (directive && directive.name) {
      directive_name = directive.name.toLowerCase();
    }
    if (directive && directive.action) {
      // console.log("Checking locks", JSON.stringify(directive));
      // try {
        const action_id = directive.action["_tdActionId"];
        // console.log("Checking locked directive:", action_id, "for request:", this.supportRequest.request_id);
        const locked_action_id = await this.chatbot.currentLockedAction(this.supportRequest.request_id);
        // console.log("locked_action_id:", locked_action_id);
        if ( locked_action_id && (locked_action_id !== action_id) ) {
          // console.log("Found locked action:", locked_action_id, "Skipping this action:", action_id);
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
          return;
        }
        else {
          // go on
          // console.log("Going on to next directive...");
        }
      
    }
    if (directive == null || (directive !== null && directive["name"] === undefined)) {
      if (context.log) { console.log("stop process(). directive is (null?):", directive);}
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
      new DirIntent(context).execute(directive, async (stop) => {
        if (stop) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
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
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.REPLY) {
      // console.log("...DirReply");
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.REPLY_V2) {
      // console.log("...DirReplyV2");
      new DirReplyV2(context).execute(directive, async (stop) => {
        if (stop) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.DTMF_FORM) {
      // console.log("...DirReply");
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.DTMF_MENU) {
      // console.log("...DirReply");
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.BLIND_TRANSFER) {
      // console.log("...DirReply");
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.SPEECH_FORM) {
      // console.log("...DirReply");
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.PLAY_PROMPT) {
      // console.log("...DirReply");
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.AUDIO_RECORD) {
      // console.log("...DirReply");
      new DirReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.RANDOM_REPLY) {
      // console.log("...DirRandomReply");
      new DirRandomReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.IF_OPEN_HOURS) {
      new DirIfOpenHours(context).execute(directive, async (stop) => {
        if (stop) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.IF_ONLINE_AGENTS) {
      // console.log("...DirIfOnlineAgents")
      new DirIfOnlineAgents(context).execute(directive, async (stop) => {
        if (stop) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
        // let next_dir = await this.nextDirective(this.directives);
        // this.process(next_dir);
      });
    }
    else if (directive_name === Directives.IF_ONLINE_AGENTS_V2) {
      // console.log("...DirIfOnlineAgents")
      new DirIfOnlineAgentsV2(context).execute(directive, async (stop) => {
        if (stop) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.FUNCTION_VALUE) {
      // console.log("...DirAssignFromFunction")
      new DirAssignFromFunction(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.CONDITION) { // DEPRECATED
      // console.log("...DirCondition");
      new DirCondition(context).execute(directive, async (stop) => {
        if (context.log) { console.log("stop on condition?", stop);}
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.JSON_CONDITION) {
      // console.log("...DirJSONCondition");
      new DirJSONCondition(context).execute(directive, async (stop) => {
        // console.log("stop on condition?", stop);
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.ASSIGN) {
      // console.log("...DirAssign", context.log);
      new DirAssign(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.SET_ATTRIBUTE) {
      // console.log("...DirSetAttribute");
      new DirSetAttribute(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.SET_ATTRIBUTE_V2) {
      // console.log("...DirSetAttribute");
      new DirSetAttributeV2(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.AGENT) {
      // console.log("...DirMoveToAgent");
      new DirMoveToAgent(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
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
      // console.log("........ DirWait");
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
    else if (directive_name === Directives.WEB_REQUEST) {
      // console.log("...DirWebRequest");
      new DirWebRequest(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.WEB_REQUEST_V2) {
      // console.log("...DirWebRequestV2");
      new DirWebRequestV2(context).execute(directive, async (stop) => {
        if (context.log) { console.log("stop on condition?", stop);}
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.FORM) {
      console.log("...DirForm");
      new DirForm(context).execute(directive, async (stop) => {
        if (context.log) { console.log("stop on form?", stop);}
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.CAPTURE_USER_REPLY) {
      // console.log("...DirCaptureUserReply");
      new DirCaptureUserReply(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.CODE) {
      // console.log("...DirCode", directive);
      new DirCode(context).execute(directive, async () => {
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
    else if (directive_name === Directives.ASK_HELP_CENTER) {
      new DirDeflectToHelpCenter(context).execute(directive, async (stop) => {
        if (context.log) { console.log("DeflectToHelpCenter stop?", stop);}
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
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
        if (context.log) { console.log("AskGPT stop?", stop);}
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
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
        if (context.log) { console.log("AskGPTV2 stop?", stop);}
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.GPT_TASK) {
      new DirGptTask(context).execute(directive, async (stop) => {
        if (context.log) { console.log("GPTTask stop?", stop);}
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
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
        if (context.log) { console.log("AiPrompt stop?", stop);}
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
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
          if (context.log) { console.log("Stoppin Actions on:", JSON.stringify(directive));}
          this.theend();
        } else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.QAPLA) {
      new DirQapla(context).execute(directive, async (stop) => {
        if (context.log) { console.log("DirQapla stop?", stop);}
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
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
        if (context.log) { console.log("DirMake stop?", stop);}
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
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
        if (context.log) { console.log("Hubspot stop?", stop);}
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
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
      // console.log("...GPT_ASSISTANT");
      new DirAssistant(context).execute(directive, async (stop) => {
        if (context.log) { console.log("stop on condition?", stop);}
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else if (directive_name === Directives.CONTACT_UPDATE) {
      // console.log("...CONTACT_UPDATE");
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
      // console.log(".....DirIntent")
      new DirConnectBlock(context).execute(directive, async () => {
        let next_dir = await this.nextDirective(this.directives);
        this.process(next_dir);
      });
    }
    else if (directive_name === Directives.ADD_TAGS) {
      // console.log(".....DirAddTags")
      new DirAddTags(context).execute(directive, async (stop) => {
        if (context.log) { console.log("GPTTask stop?", stop);}
        if (stop == true) {
          if (context.log) { console.log("Stopping Actions on:", JSON.stringify(directive));}
          this.theend();
        }
        else {
          let next_dir = await this.nextDirective(this.directives);
          this.process(next_dir);
        }
      });
    }
    else {
      //console.log("Unhandled Post-message Directive:", directive_name);
      let next_dir = await this.nextDirective(this.directives);
      this.process(next_dir);
    }
  }

  // DEPRECATED
  processInlineDirectives(pipeline, theend) {
    const directives = this.directives;
    if (!directives || directives.length === 0) {
      console.log("No directives to process.");
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
      // else if (directive_name === Directives.WHEN_OFFLINE_HOURS) { // DEPRECATED
      //   const offlineHoursDir = new DirOfflineHours(tdclient);
      //   offlineHoursDir.execute(directive, pipeline, () => {
      //     process(nextDirective());
      //   });
      // }
      // else if (directive_name === Directives.DISABLE_INPUT_TEXT) { // DEPRECATED => will change in a "message-option" --disableInput
      //   const disableInputTextDir = new DirDisableInputText();
      //   disableInputTextDir.execute(directive, pipeline, () => {
      //     process(nextDirective());
      //   });
      // }
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