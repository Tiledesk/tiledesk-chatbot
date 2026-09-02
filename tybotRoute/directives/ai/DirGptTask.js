const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../../variables/Filler");
const { DirIntent } = require("../flow/DirIntent");
const { TiledeskChatbotConst } = require("../../engine/TiledeskChatbotConst");
const { TiledeskChatbotUtil } = require("../../utils/TiledeskChatbotUtil");
require('dotenv').config();
const winston = require('../../utils/winston');
const quotasService = require("../../services/QuotasService");
const llmKeyService = require("../../services/LLMKeyService");
const openAIService = require("../../services/OpenAIService");
const { BaseDirective } = require("../BaseDirective");
const { Directives } = require('../Directives');

class DirGptTask extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.GPT_TASK];

  constructor(context) {
    super(context);
    this.chatbot = this.context.chatbot;

    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
    winston.verbose("Execute GptTask directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirGptTask Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[ChatGPT Task] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirGptTask) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirGptTask) Error: tdcache is mandatory");
      callback();
      return;
    }

    let publicKey = false;
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;
    let transcript;

    winston.debug("(DirGptTask) trueIntent " + trueIntent)
    winston.debug("(DirGptTask) falseIntent " + falseIntent)
    winston.debug("(DirGptTask) trueIntentAttributes " + trueIntentAttributes)
    winston.debug("(DirGptTask) falseIntentAttributes " + falseIntentAttributes)

    // default value
    let answer = "No answer.";
    let model = "gpt-3.5-turbo";

    if (!action.question || action.question === '') {
      this.logger.warn("[ChatGPT Task] question attribute is mandatory");
      winston.debug("(DirGptTask) Error: question attribute is mandatory. Executing condition false...")
      if (falseIntent) {
        await this.chatbot.addParameter("flowError", "GPT Error: question attribute is undefined");
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    const filler = new Filler();
    const filled_question = filler.fill(action.question, requestVariables);
    const filled_context = filler.fill(action.context, requestVariables);

    let max_tokens = action.max_tokens;
    let temperature = action.temperature;
    
    if (action.model) {
      model = action.model;
    }

    winston.debug("(DirGptTask) max_tokens: " + max_tokens);
    winston.debug("(DirGptTask) temperature: " + temperature);

    if (action.history) {
      let transcript_string = await TiledeskChatbot.getParameterStatic(
        this.context.tdcache,
        this.context.requestId,
        TiledeskChatbotConst.REQ_TRANSCRIPT_KEY);
        winston.debug("(DirGptTask) transcript string: " + transcript_string)

      if (transcript_string) {
        transcript = await TiledeskChatbotUtil.transcriptJSON(transcript_string);
        winston.debug("(DirGptTask) transcript: ", transcript)
      } else {
        winston.debug("(DirGptTask) transcript_string is undefined. Skip JSON translation for chat history");
      }
    }

    const resolved_key = await llmKeyService.resolveOpenAIKey(this.projectId, this.token, {
      caller: "(DirGptTask)",
      onIntegrationMiss: () => {
        this.logger.native("[ChatGPT Task] Key not found in Integrations.");
        winston.debug("(DirGptTask) - Key not found in Integrations. Searching in kb settings...");
      },
      onPublicKey: () => {
        this.logger.native("[ChatGPT Task] Retrieve shared gptkey.");
        winston.debug("(DirGptTask) - Retrieve public gptkey")
      }
    });
    let key = resolved_key.key;
    publicKey = resolved_key.publicKey;

    if (!key) {
      this.logger.error("[ChatGPT Task] OpenAI key is mandatory");
      winston.error("(DirGptTask) gptkey is mandatory");
      await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);
      if (falseIntent) {
        await this.chatbot.addParameter("flowError", "GPT Error: gpt apikey is undefined");
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    if (publicKey === true) {
      let keep_going = await quotasService.checkQuoteAvailability(this.projectId, this.token);
      if (keep_going === false) {
        this.logger.warn("[ChatGPT Task] OpenAI tokens quota exceeded");
        await this.chatbot.addParameter("flowError", "GPT Error: tokens quota exceeded");
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback();
        return;
      }
    }

    let json = {
      model: action.model,
      messages: [],
      max_tokens: action.max_tokens,
      temperature: action.temperature,
    }

    if (action.context) {
      let message = { role: "system", content: filled_context }
      json.messages.push(message);
    }

    if (transcript) {
      transcript.forEach(msg => {
        if (!msg.content.startsWith('/')) {
          let message = { role: msg.role, content: msg.content }
          json.messages.push(message)
        }
      })
      json.messages.push({ role: "user", content: filled_question });
    } else {
      let message = { role: "user", content: filled_question };
      json.messages.push(message);
    } 

    if (action.formatType && action.formatType !== 'none') {
      json.response_format = {
        type: action.formatType
      }
    }
    
    winston.debug("(DirGptTask) json: ", json)

    const { err, resbody } = await openAIService.chatCompletions(key, json, "(DirGptTask)");

    if (err) {
      winston.debug("(DirGptTask) openai err: ", err);
      winston.debug("(DirGptTask) openai err: " + err.response?.data?.error?.message);
      this.logger.error("[ChatGPT Task] Completions error: ", err.response?.data?.error?.message);
      await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);
      if (falseIntent) {
        await this.chatbot.addParameter("flowError", "GPT Error: " + err.response?.data?.error?.message);
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    } else {
      winston.debug("(DirGptTask) resbody: ", resbody);
      // OPENAI_ENDPOINT is configurable, so this 2xx body is whatever the
      // configured completions host answered with. Read unguarded, a body with
      // no `choices` threw "Cannot read properties of undefined (reading '0')"
      // inside this async go() -- an unhandled rejection (fatal under Node's
      // default --unhandled-rejections=throw) and a directive that never
      // called back. `answer` keeps the "No answer." default declared above,
      // which is what every other no-completion exit in this file already
      // writes.
      const completion = resbody?.choices?.[0]?.message?.content;
      if (completion === undefined || completion === null) {
        this.logger.error("[ChatGPT Task] the completion answered with no choices");
        winston.error("(DirGptTask) the completion answered with no choices: ", resbody);
      }
      else {
        answer = completion;
      }

      if (action.formatType === 'json_object' || action.formatType === undefined || action.formatType === null) {
        answer = await this.convertToJson(answer);
      }

      this.logger.native("[ChatGPT Task] Completions answer: ", answer);

      await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);

      if (publicKey === true) {
        let tokens_usage = {
          tokens: resbody.usage.total_tokens,
          model: json.model
        }
        quotasService.updateQuote(this.projectId, this.token, tokens_usage);
      }

      if (trueIntent) {
        await this._executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

  }

  async convertToJson(data) {

    return new Promise((resolve) => {
      let json = null;
      try {
        json = JSON.parse(data);
        resolve(json)
      } catch (err) {
        resolve(data)
      }
    })

  }

}

module.exports = { DirGptTask }