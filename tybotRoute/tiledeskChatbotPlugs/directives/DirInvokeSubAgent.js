const { Logger } = require('../../Logger');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../utils/TiledeskChatbotUtil');
const { TiledeskChatbotConst } = require('../../engine/TiledeskChatbotConst');
const { DirIntent } = require('./DirIntent');
const winston = require('../../utils/winston');

class DirInvokeSubAgent {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.projectId = context.projectId;
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    const action = directive.action;
    if (!action) {
      this.logger.error('[Invoke Sub-Agent] Incorrect action for ', directive.name, directive);
      callback();
      return;
    }

    this.go(action, (stop) => {
        this.logger.native('[Invoke Sub-Agent] Executed');
        callback(stop);
    }).catch((err) => {
      this.logger.error('[Invoke Sub-Agent] Error:', err);
      callback();
    });
  }

  async go(action, callback) {
    const subagent_id = action.subagent_id;
    const intentName = action.intentName;
    if (!subagent_id || !intentName) {
      this.logger.error('[Invoke Sub-Agent] subagent_id and intentName are required');
      callback();
      return;
    }

    let subIntent;
    try {
      subIntent = await this.chatbot.botsDataSource.getByIntentDisplayNameCache(
        subagent_id,
        intentName,
        this.tdcache
      );
    } catch (err) {
      this.logger.error('[Invoke Sub-Agent] Failed to load subagent intent:', err);
      callback();
      return;
    }

    if (!subIntent || !subIntent.actions || subIntent.actions.length === 0) {
      this.logger.error('[Invoke Sub-Agent] No actions for subagent intent:', intentName, subagent_id);
      callback();
      return;
    }

    let subBotMeta;
    try {
      subBotMeta = await this.chatbot.botsDataSource.getBotByIdCache(subagent_id, this.tdcache);
    } catch (err) {
      this.logger.error('[Invoke Sub-Agent] Failed to load subagent bot:', err);
      callback();
      return;
    }

    if (subIntent.actions && subIntent.actions.length > 0) {
      TiledeskChatbotUtil.addConnectAction(subIntent);
    }

    const directives = TiledeskChatbotUtil.actionsToDirectives(subIntent.actions);
    if (!directives.length) {
      callback();
      return;
    }

    const subSupportRequest = Object.assign({}, this.context.supportRequest, { bot_id: subagent_id });

    const subChatbot = new TiledeskChatbot({
      botsDataSource: this.chatbot.botsDataSource,
      intentsFinder: this.chatbot.intentsFinder,
      backupIntentsFinder: this.chatbot.backupIntentsFinder,
      botId: subagent_id,
      bot: subBotMeta,
      token: this.context.token,
      APIURL: this.context.API_ENDPOINT,
      APIKEY: this.chatbot.APIKEY,
      tdcache: this.tdcache,
      requestId: this.requestId,
      projectId: this.projectId,
      MAX_STEPS: this.chatbot.MAX_STEPS,
      MAX_EXECUTION_TIME: this.chatbot.MAX_EXECUTION_TIME
    });

    const reply = {
      actions: subIntent.actions,
      attributes: {
        intent_info: {
          intent_name: subIntent.intent_display_name,
          intent_id: subIntent.intent_id,
          botId: subagent_id,
          bot: subBotMeta
        }
      }
    };

    const { DirectivesChatbotPlug } = require('../DirectivesChatbotPlug');

    const directivesPlug = new DirectivesChatbotPlug({
      message: this.context.message,
      reply: reply,
      directives: directives,
      chatbot: subChatbot,
      supportRequest: subSupportRequest,
      API_ENDPOINT: this.context.API_ENDPOINT,
      TILEBOT_ENDPOINT: this.context.TILEBOT_ENDPOINT,
      token: this.context.token,
      HELP_CENTER_API_ENDPOINT: this.context.HELP_CENTER_API_ENDPOINT,
      cache: this.tdcache
    });

    const awaitWebhookPublish = action.awaitWebhookPublish === true && this.tdcache;

    if (awaitWebhookPublish) {
      await this.runSubAgentWithWebhookRace(directivesPlug, callback, action);
      return;
    }

    await new Promise((resolve) => {
      directivesPlug.processDirectives(() => {
        resolve();
      });
    });

    callback();
  }

  /**
   * Published JSON shape from DirWebResponse: `{ status, payload }`.
   */
  static isSuccessWebhookStatus(status) {
    if (status === undefined || status === null || status === '') {
      return true;
    }
    const n = Number(status);
    if (!Number.isNaN(n)) {
      return n >= 200 && n <= 299;
    }
    const s = String(status);
    return s.length >= 1 && s[0] === '2';
  }

  /**
   * Waits for Redis pub/sub on `/webhooks/${requestId}` (same payload as DirWebResponse).
   * Assigns `assignResultTo` with the webhook JSON `payload`, then routes `trueIntent` / `falseIntent`
   * on the parent bot (DirIntent) based on HTTP-style `status` (2xx = success).
   */
  async runSubAgentWithWebhookRace(directivesPlug, parentCallback, action) {
    const topic = `/webhooks/${this.requestId}`;
    const readyKey = TiledeskChatbotConst.redisWebhookReadyKey(this.requestId);

    let resolveWebhook;
    const webhookPromise = new Promise((resolve) => {
      resolveWebhook = resolve;
    });

    try {
      await this.tdcache.subscribe(topic, async (msg) => {
        let parsed;
        try {
          parsed = JSON.parse(msg);
        } catch (e) {
          parsed = { status: 200, payload: msg };
        }
        try {
          await this.tdcache.unsubscribe(topic);
        } catch (e) {
          winston.warn('(DirInvokeSubAgent) unsubscribe after webhook:', e);
        }
        try {
          await this.tdcache.del(readyKey);
        } catch (e) {
          winston.warn('(DirInvokeSubAgent) del webhook_ready after pub:', e);
        }
        resolveWebhook(parsed);
      });
    } catch (err) {
      this.logger.error('[Invoke Sub-Agent] Redis subscribe failed:', err);
      parentCallback();
      return;
    }

    // Do not tie completion to nested processDirectives theend: DirIntent often stops the nested
    // plug with callback(true) before web_response runs on a follow-up HTTP request; the webhook
    // publish is the real completion signal.
    directivesPlug.processDirectives(() => {});

    const parsed = await webhookPromise;

    await this.tdcache.del(readyKey).catch(() => {});

    await this.applyWebhookOutcome(parsed, action, parentCallback);
  }

  async applyWebhookOutcome(parsed, action, parentCallback) {
    const assignKey = action.assignResultTo;
    console.log("\n\n\nassignKey: ", assignKey);
    console.log("\n\n\nparsed: ", parsed);
    if (assignKey && this.tdcache) {
      const value = parsed && Object.prototype.hasOwnProperty.call(parsed, 'payload')
        ? parsed.payload
        : parsed;
      try {
        console.log("adding parameter")
        await TiledeskChatbot.addParameterStatic(this.tdcache, this.requestId, assignKey, value);
        console.log("parameter added")
      } catch (e) {
        this.logger.error('[Invoke Sub-Agent] assignResultTo failed:', e);
      }
    }

    const success = DirInvokeSubAgent.isSuccessWebhookStatus(parsed && parsed.status);
    const targetIntent = success ? action.trueIntent : action.falseIntent;
    if (!targetIntent) {
      parentCallback();
      return;
    }

    const attrs = success ? action.trueIntentAttributes : action.falseIntentAttributes;
    const intentDir = new DirIntent(this.context);
    const dir = DirIntent.intentDirectiveFor(targetIntent, attrs);
    intentDir.execute(dir, (stop) => parentCallback(stop));
  }

  
}

module.exports = { DirInvokeSubAgent };
