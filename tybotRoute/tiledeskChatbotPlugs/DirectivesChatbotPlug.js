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
const { DirGptResponse } = require('./directives/DirGptResponse');
const { DirPicallexSendTemplate } = require('./directives/DirPicallexSendTemplate');
const { DirPicallexCallLead } = require('./directives/DirPicallexCallLead');
const { DirPicallexCheckStopPolicies } = require('./directives/DirPicallexCheckStopPolicies');
const { DirPicallexSfActivity } = require('./directives/DirPicallexSfActivity');
const { DirPicallexSfUpdateObject } = require('./directives/DirPicallexSfUpdateObject');

const winston = require('../utils/winston');
const { DirFlowLog } = require('./directives/DirFlowLog');
const { DirAddKbContent } = require('./directives/DirAddKbContent');
const { FlowExecutionStore } = require('../services/FlowExecutionStore');

/**
 * Per-directive timeout budget for the supervisor's "is it stuck?" check.
 * The supervisor considers a running execution due for inspection when
 *   now > current.expected_end_at = started_at + DIRECTIVE_TIMEOUTS_MS[name]
 * For WAIT directives, the wait's own millis overrides this default.
 *
 * Choose values generous enough that healthy executions don't trip them
 * but tight enough that genuinely crashed ones get noticed within a
 * reasonable window. These are conservative defaults; tune per directive
 * if real-world telemetry shows otherwise.
 */
const DIRECTIVE_TIMEOUTS_MS = {
  // Wait-by-design (overridden with the wait's actual duration)
  wait: 60_000,
  wait_variable: 60_000,
  // HTTP-bound calls
  web_request: 60_000,
  web_request_v2: 60_000,
  fire_tiledesk_event: 30_000,
  make: 60_000,
  hubspot: 30_000,
  customerio: 30_000,
  brevo: 30_000,
  picallex_send_template: 30_000,
  picallex_call_lead: 30_000,
  picallex_sf_activity: 30_000,
  picallex_sf_update_object: 30_000,
  picallex_check_stop_policies: 15_000,
  send_email: 30_000,
  send_whatsapp: 30_000,
  // LLM calls — longer, may include retries internally
  ask_gpt: 120_000,
  ask_gpt_v2: 120_000,
  ai_prompt: 120_000,
  ai_condition: 120_000,
  gpt_task: 120_000,
  gpt_response: 120_000,
  gpt_assistant: 180_000,
  // Outbound messages — near-instant but include SMTP/MQTT-ish slack
  reply: 10_000,
  reply_v2: 10_000,
  message: 10_000,
  hmessage: 10_000,
  random_reply: 10_000,
};
const DEFAULT_DIRECTIVE_TIMEOUT_MS = 5_000;

/**
 * Directives with external side-effects. The checkpoint engine will:
 *   - look up the idempotency_key in side_effects before executing
 *   - skip the call if a prior run already recorded it
 *   - append to the log on success
 *
 * Pure/internal directives (assign, condition, code, set_attribute, etc.)
 * are safe to re-execute and are NOT in this set.
 */
const SIDE_EFFECT_DIRECTIVES = new Set([
  'send_email', 'send_whatsapp',
  'web_request', 'web_request_v2',
  'fire_tiledesk_event',
  'make', 'hubspot', 'customerio', 'brevo',
  'picallex_send_template', 'picallex_call_lead',
  'picallex_sf_activity', 'picallex_sf_update_object',
  'ask_gpt', 'ask_gpt_v2', 'ai_prompt', 'gpt_task', 'gpt_response', 'gpt_assistant',
  'reply', 'reply_v2', 'message', 'hmessage', 'random_reply'
]);

/**
 * Detect if a request_id belongs to a fire-and-forget automation.
 * Conversational bot flows do NOT use checkpointing — their reconciliation
 * lives in PHP (Picallex/Services/WhatsApp/Crons/TreatConversationalBots).
 */
function isAutomationRequest(requestId) {
  return typeof requestId === 'string' && requestId.startsWith('automation-request-');
}

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

    // Checkpoint mode is active only for automation request_ids AND the
    // global flag. Conversational bots intentionally never enter this path.
    const requestId = this.supportRequest && this.supportRequest.request_id;
    const projectId = this.supportRequest && this.supportRequest.id_project;
    this.checkpointEnabled =
      process.env.FLOW_CHECKPOINT_ENABLED === 'true' &&
      isAutomationRequest(requestId);
    this.executionId = this.checkpointEnabled
      ? FlowExecutionStore.executionIdFromRequestId(requestId, projectId)
      : null;
    // Cached doc — refreshed by beginDirective() so the side-effect lookup
    // sees the latest log without an extra read.
    this._executionDoc = null;
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

    // In checkpoint mode, create or load the FlowExecution doc.
    //
    // CRITICAL: every processDirectives call is by definition a NEW CHAIN.
    // Tiledesk's HTTP routes invoke processDirectives once per bot reply,
    // and intent navigation triggers separate roundtrips that hit the
    // route again with a different directives array. The supervisor uses
    // resumeFromIndex (NOT processDirectives) to continue an in-progress
    // chain. So:
    //   - fresh execution_id: getOrCreate creates the doc and we start at 0.
    //   - existing doc (any status): archive its current state into
    //     previous_chains[] and reset the active fields for the new chain.
    //     This guarantees the supervisor's view (status, current,
    //     side_effects) always reflects the chain that is actually running.
    let startFromIndex = 0;
    if (this.checkpointEnabled && this.executionId) {
      try {
        let { doc, created } = await FlowExecutionStore.getOrCreate({
          executionId: this.executionId,
          requestId: supportRequest.request_id,
          botId: supportRequest.bot_id || (this.chatbot && this.chatbot.botId),
          projectId: projectId,
          token: token,
          trigger: {
            block_id: this.message && this.message.attributes && this.message.attributes.payload
              ? this.message.attributes.payload.block_id : null,
            payload: this.message && this.message.attributes && this.message.attributes.payload
          },
          snapshot: {
            message: this.message,
            reply: this.reply,
            supportRequest: supportRequest,
            directives: directives,
            parameters: {}
          }
        });

        if (!created) {
          doc = await FlowExecutionStore.archiveAndStartNewChain(this.executionId, {
            newMessage: this.message,
            newReply: this.reply,
            newSupportRequest: supportRequest,
            newDirectives: directives,
            newParameters: (doc.snapshot && doc.snapshot.parameters) || {}
          });
          winston.info(`(DirectivesChatbotPlug) New chain on execution ${this.executionId} (archived chain #${(doc.previous_chains || []).length - 1})`);
        } else {
          winston.info(`(DirectivesChatbotPlug) Started execution ${this.executionId} (created=true)`);
        }
        this._executionDoc = doc;
      } catch (err) {
        winston.error("(DirectivesChatbotPlug) Failed to init FlowExecution; continuing without checkpoint:", err);
        this.checkpointEnabled = false;
        this._executionDoc = null;
      }
    }

    this.curr_directive_index = startFromIndex - 1;
    const next_dir = await this.nextDirective(directives);
    winston.debug("(DirectivesChatbotPlug) next_dir: ", next_dir);
    await this.process(next_dir);
  }

  /**
   * Resume directive execution from a specific index. Used by the
   * FlowExecutionSupervisor after a checkpoint deadline expires (e.g.
   * the wait finished, or a crashed directive needs to be retried).
   *
   * Mirrors processDirectives() initialisation but starts at start_index
   * instead of zero, and assumes the FlowExecution doc already exists.
   */
  async resumeFromIndex(startIndex, theend) {
    this.theend = theend || (() => {});
    const directives = this.directives;
    if (!directives || directives.length === 0 || startIndex >= directives.length) {
      winston.verbose("(DirectivesChatbotPlug) resumeFromIndex: nothing to process");
      if (this.checkpointEnabled && this.executionId) {
        await FlowExecutionStore.markCompleted(this.executionId);
      }
      return this.theend();
    }
    const supportRequest = this.supportRequest;
    const projectId = supportRequest.id_project;
    let depId;
    if (supportRequest.department && supportRequest.department._id) {
      depId = supportRequest.department._id;
    }
    this.context = {
      projectId: projectId,
      chatbot: this.chatbot,
      message: this.message,
      token: this.token,
      supportRequest: supportRequest,
      reply: this.reply,
      requestId: supportRequest.request_id,
      API_ENDPOINT: this.API_ENDPOINT,
      TILEBOT_ENDPOINT: this.TILEBOT_ENDPOINT,
      departmentId: depId,
      tdcache: this.tdcache,
      HELP_CENTER_API_ENDPOINT: this.HELP_CENTER_API_ENDPOINT,
      __resumed: true
    };
    this.curr_directive_index = startIndex - 1;
    winston.verbose(`(DirectivesChatbotPlug) resumeFromIndex at ${startIndex}`);
    const next_dir = await this.nextDirective(directives);
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
      // End-of-chain: the directives array was exhausted normally (no
      // directive signalled stop=true). In checkpoint mode we must mark
      // the chain as completed; otherwise the supervisor keeps claiming
      // the stale expected_end_at and retrying forever.
      if (this.checkpointEnabled && this.executionId) {
        try {
          await FlowExecutionStore.markCompleted(this.executionId);
        } catch (err) {
          winston.error("(DirectivesChatbotPlug) markCompleted at end-of-chain failed:", err);
        }
      }
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
      [Directives.WAIT_VARIABLE]: DirWait,
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
      [Directives.GPT_RESPONSE]: DirGptResponse,
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
      [Directives.PICALLEX_SEND_TEMPLATE]: DirPicallexSendTemplate,
      [Directives.PICALLEX_CALL_LEAD]: DirPicallexCallLead,
      [Directives.PICALLEX_CHECK_STOP_POLICIES]: DirPicallexCheckStopPolicies,
      [Directives.PICALLEX_SF_ACTIVITY]: DirPicallexSfActivity,
      [Directives.PICALLEX_SF_UPDATE_OBJECT]: DirPicallexSfUpdateObject,
    };

    const HandlerClass = handlers[directive_name];
    if (!HandlerClass) {
      const next_dir = await this.nextDirective(this.directives);
      return this.process(next_dir);
    }

    const handler = new HandlerClass(context);

    // -------------------------------------------------------------------
    // Checkpoint mode (automations only)
    // -------------------------------------------------------------------
    // For each directive we:
    //   1. Compute its expected deadline (timeout budget; for WAIT we read
    //      the wait's own millis), and persist `current` to Mongo.
    //   2. If it's a WAIT, we DO NOT execute the handler. We just persist
    //      the deadline and return — the supervisor resumes the next
    //      directive when the deadline passes. This avoids holding a
    //      setTimeout in memory (which dies on deploy/crash).
    //   3. If it's a side-effect directive, look up the idempotency_key in
    //      side_effects. If found, skip the handler (the previous run
    //      already executed it) and proceed to the next directive. If not
    //      found, run the handler and append a marker on success.
    //   4. Pure directives (assign, condition, ...) just run.
    // -------------------------------------------------------------------
    if (this.checkpointEnabled && this.executionId) {
      const idx = this.curr_directive_index;
      const isWait = (directive_name === 'wait' || directive_name === 'wait_variable');
      const isSideEffect = SIDE_EFFECT_DIRECTIVES.has(directive_name);
      const timeoutMs = isWait
        ? await this._resolveWaitMillis(directive)
        : (DIRECTIVE_TIMEOUTS_MS[directive_name] || DEFAULT_DIRECTIVE_TIMEOUT_MS);

      // Snapshot the live parameters from Redis so they're durable in
      // Mongo. This makes Redis a pure cache: on resume the supervisor
      // rehydrates these into Redis, so the flow survives even a full
      // Redis wipe (not just a chatbot restart).
      let liveParams = undefined;
      try {
        liveParams = await this.chatbot.allParameters();
      } catch (err) {
        winston.error("(DirectivesChatbotPlug) reading params for snapshot failed:", err);
      }

      // Persist `current` (start time + deadline) + params snapshot. For
      // WAIT, advance the index so the supervisor's resume targets the
      // next directive.
      const persistedIndex = isWait ? idx + 1 : idx;
      try {
        this._executionDoc = await FlowExecutionStore.beginDirective(this.executionId, {
          directiveIndex: persistedIndex,
          directiveName: directive_name,
          expectedTimeoutMs: timeoutMs,
          parameters: liveParams
        });
      } catch (err) {
        winston.error("(DirectivesChatbotPlug) beginDirective failed (continuing best-effort):", err);
      }

      if (isWait) {
        // Stop executing in-process. Supervisor will pick up at deadline.
        winston.info(`(DirectivesChatbotPlug) [checkpoint] WAIT persisted ${timeoutMs}ms. Exiting chain.`);
        return this.theend();
      }

      if (isSideEffect) {
        const key = FlowExecutionStore.idempotencyKey(this.executionId, idx, directive);
        const prior = FlowExecutionStore.findSideEffect(this._executionDoc, key);
        if (prior) {
          winston.info(`(DirectivesChatbotPlug) [checkpoint] side-effect ${directive_name} already done (key=${key}); skipping`);
          const next_dir = await this.nextDirective(this.directives);
          return this.process(next_dir);
        }
        // Execute and, on success, append marker.
        const startedAt = Date.now();
        return handler.execute(directive, async (stop) => {
          try {
            await FlowExecutionStore.appendSideEffect(this.executionId, {
              idempotencyKey: key,
              directiveName: directive_name,
              directiveIndex: idx,
              result: { stopped: !!stop },
              durationMs: Date.now() - startedAt
            });
          } catch (err) {
            winston.error("(DirectivesChatbotPlug) appendSideEffect failed:", err);
          }
          if (stop) {
            await FlowExecutionStore.markCompleted(this.executionId);
            return this.theend();
          }
          const next_dir = await this.nextDirective(this.directives);
          return this.process(next_dir);
        });
      }

      // Pure / internal directive — run normally; advance current on completion.
      return handler.execute(directive, async (stop) => {
        if (stop) {
          await FlowExecutionStore.markCompleted(this.executionId);
          return this.theend();
        }
        const next_dir = await this.nextDirective(this.directives);
        return this.process(next_dir);
      });
    }

    // -------------------------------------------------------------------
    // Legacy path — conversational bots and any automation with checkpoint
    // disabled go through here. Unchanged behaviour.
    // -------------------------------------------------------------------
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

  /**
   * Resolve the wait duration for a WAIT/WAIT_VARIABLE directive without
   * actually executing DirWait. Mirrors DirWait.resolveMillis. Used by the
   * checkpoint path to compute the deadline.
   */
  async _resolveWaitMillis(directive) {
    let action;
    if (directive.action) {
      action = directive.action;
    } else if (directive.parameter) {
      const _m = parseInt(String(directive.parameter).trim(), 10);
      action = { millis: Number.isFinite(_m) ? _m : 500 };
    } else {
      action = { millis: 500 };
    }
    let millis = action.millis;
    // Variable form: { value, isVariable: true }
    if (millis && typeof millis === 'object') {
      const v = millis.value;
      if (millis.isVariable && this.chatbot && this.chatbot.getParameter) {
        const name = String(v).trim().replace(/^\{\{\s*|\s*\}\}$/g, '');
        millis = await this.chatbot.getParameter(name);
      } else {
        millis = v;
      }
    }
    // String — could be a number-string or a {{var}} reference
    if (typeof millis === 'string') {
      const n = Number(millis);
      if (Number.isFinite(n)) {
        millis = n;
      } else if (this.chatbot && this.chatbot.getParameter) {
        const name = millis.trim().replace(/^\{\{\s*|\s*\}\}$/g, '');
        millis = await this.chatbot.getParameter(name);
      }
    }
    const parsed = Number(millis);
    if (!Number.isFinite(parsed) || parsed < 100) return 1000;
    return parsed;
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
