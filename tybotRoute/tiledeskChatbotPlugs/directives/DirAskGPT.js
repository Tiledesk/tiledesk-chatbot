const axios = require("axios").default;
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');
let https = require("https");
const { DirIntent } = require("./DirIntent");
require('dotenv').config();
const winston = require('../../utils/winston');
const httpUtils = require("../../utils/HttpUtils");
const llmKeyService = require("../../services/LLMKeyService");
const llmAskService = require("../../services/LlmAskService");
const { BaseDirective } = require("../BaseDirective");
const { Directives } = require('./Directives');

class DirAskGPT extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.ASK_GPT];

  constructor(context) {
    super(context);
    this.chatbot = this.context.chatbot;

    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
    winston.verbose("Execute AskGPT directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirAskGPT Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirAskGPT) Action: ", action);
    if (!this.tdcache) {
      winston.error("Error: DirAskGPT tdcache is mandatory");
      callback();
      return;
    }

    let publicKey = false;
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    winston.debug("(DirAskGPT) trueIntent " + trueIntent)
    winston.debug("(DirAskGPT) falseIntent " + falseIntent)
    winston.debug("(DirAskGPT) trueIntentAttributes " + trueIntentAttributes)
    winston.debug("(DirAskGPT) falseIntentAttributes " + falseIntentAttributes)

    // default values
    let answer = "No answers";
    let source = null;

    if (!action.question || action.question === '') {
      winston.error("(DirAskGPT) Error: question attribute is mandatory. Executing condition false...");
      await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }], ['assignSourceTo', source, { onlyIfTruthy: true }]]);
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
      }
      callback(true);
      return;
    }

    if (!action.kbid) {
      winston.error("(DirAskGPT) Error: kbid attribute is mandatory. Executing condition false...");
      await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }], ['assignSourceTo', source, { onlyIfTruthy: true }]]);
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes)
      }
      callback(true);
      return;
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );

    const filler = new Filler();
    const filled_question = filler.fill(action.question, requestVariables);

    winston.verbose("DirAskGPT KbEndpoint URL: ", llmAskService.legacyKbBaseUrl());

    const resolved_key = await llmKeyService.resolveOpenAIKey(this.projectId, this.token, {
      caller: "(DirAskGPT)",
      onIntegrationMiss: () => {
        winston.debug("(DirAskGPT) - Key not found in Integrations. Searching in kb settings...");
      },
      onPublicKey: () => {
        winston.debug("(DirAskGPT) - Retrieve public gptkey")
      }
    });
    let key = resolved_key.key;
    publicKey = resolved_key.publicKey;

    if (!key) {
      winston.error("(DirAskGPT) Error: gptkey is mandatory");
      await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    if (publicKey === true) {
      let keep_going = await this.checkQuoteAvailability();
      if (keep_going === false) {
        winston.debug("(DirAskGPT) - Quota exceeded for tokens. Skip the action")
        callback();
        return;
      }
    }

    let json = {
      question: filled_question,
      kbid: action.kbid,
      gptkey: key,
      agent_id: this.chatbot?.bot.root_id || null,
      id_project: this.projectId,
      request_id: this.requestId
    };
    winston.debug("(DirAskGPT)DirAskGPT json:", json); 

    const { err, resbody } = await llmAskService.askLegacyKb(json, "(DirAskGPT)");

    winston.debug("(DirAskGPT) resbody:", resbody);
    // These two shadowed the outer `answer`/`source` while the body lived
    // inside the request callback; renamed now that it does not. Nothing but
    // the _assignAttributes call below ever read them - including on the error
    // path, where `resbody` is null and this line throws, exactly as before.
    let kb_answer = resbody.answer;
    let kb_source = resbody.source_url;
    await this._assignAttributes(action, [['assignReplyTo', kb_answer, { onlyIfTruthy: true }], ['assignSourceTo', kb_source, { onlyIfTruthy: true }]]);

    if (err) {
      winston.error("(DirAskGPT) error: ", err);
      if (callback) {
        if (falseIntent) {
          await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      }
    }
    else if (resbody.success === true) {

      // if (publicKey === true) {
      //   let token_usage = resbody.usage.total_tokens;
      //   this.updateQuote(token_usage);
      // }

      if (trueIntent) {
        await this._executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    } else {
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }
  }

}

module.exports = { DirAskGPT }
