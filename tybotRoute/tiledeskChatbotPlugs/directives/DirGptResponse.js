const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
require('dotenv').config();
const winston = require('../../utils/winston');
const httpUtils = require("../../utils/HttpUtils");
const integrationService = require("../../services/IntegrationService");
const { Logger } = require("../../Logger");

class DirGptResponse {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.chatbot = this.context.chatbot;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.projectId = this.context.projectId;
    this.token = this.context.token;
    this.API_ENDPOINT = this.context.API_ENDPOINT;

    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.verbose("Execute GptResponse directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive);
      winston.warn("DirGptResponse Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[OpenAI Response] Executed");
      callback(stop);
    });
  }

  async go(action, callback) {
    winston.debug("(DirGptResponse) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirGptResponse) Error: tdcache is mandatory");
      callback();
      return;
    }

    let publicKey = false;
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    winston.debug("(DirGptResponse) trueIntent " + trueIntent);
    winston.debug("(DirGptResponse) falseIntent " + falseIntent);

    let answer = "No answer.";

    if (!action.prompt || action.prompt === '') {
      this.logger.warn("[OpenAI Response] prompt attribute is mandatory");
      winston.debug("(DirGptResponse) Error: prompt attribute is mandatory. Executing condition false...");
      if (falseIntent) {
        await this.chatbot.addParameter("flowError", "GPT Response Error: prompt attribute is undefined");
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
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
      );

    const filler = new Filler();
    const filled_prompt = filler.fill(action.prompt, requestVariables);
    const filled_response_id = this.#resolveActionValue(action.responseId, requestVariables, filler, true);

    // Resolve the "Previous Response ID" input (attribute name or liquid expression).
    let previous_response_id = this.#resolveActionValue(action.previousResponseIdAttribute, requestVariables, filler);

    // A resp_ value passed through the responseId field is also previous-response chaining.
    if (!previous_response_id && filled_response_id && filled_response_id.startsWith('resp_')) {
      previous_response_id = filled_response_id;
    }

    // When there is no Previous Response ID, fall back to the Conversations methodology:
    // the thread is kept server-side via a conversation id stored in a well-known
    // attribute, so it is reused automatically across turns.
    //
    // The attribute name is namespaced per unique prompt id (pmpt_xxxx) so that
    // different OpenAI Response blocks in the same flow each keep their own
    // conversation thread instead of all sharing a single one. When the response id
    // is not a prompt id (a model name or empty), fall back to the shared
    // `conversationId` attribute.
    const useConversation = !previous_response_id;
    const conversationAttributeName = (filled_response_id && filled_response_id.startsWith('pmpt_'))
      ? "conversationId_" + filled_response_id
      : "conversationId";
    let conversation_id = useConversation
      ? this.#resolveActionValue(conversationAttributeName, requestVariables, filler)
      : null;

    winston.debug("(DirGptResponse) filled_prompt: " + filled_prompt);
    winston.debug("(DirGptResponse) filled_response_id: " + filled_response_id);
    winston.debug("(DirGptResponse) previous_response_id: " + previous_response_id);
    winston.debug("(DirGptResponse) useConversation: " + useConversation);
    winston.debug("(DirGptResponse) conversationAttributeName: " + conversationAttributeName);
    winston.debug("(DirGptResponse) conversation_id: " + conversation_id);

    const openai_base = process.env.OPENAI_ENDPOINT;
    const openai_url = openai_base + "/responses";
    winston.debug("(DirGptResponse) openai_url: " + openai_url);

    let key = await integrationService.getKeyFromIntegrations(this.projectId, 'openai', this.token);
    if (!key) {
      this.logger.native("[OpenAI Response] Key not found in Integrations.");
      winston.debug("(DirGptResponse) - Key not found in Integrations. Searching in kb settings...");
      key = await this.getKeyFromKbSettings();
    }

    if (!key) {
      this.logger.native("[OpenAI Response] Retrieve shared gptkey.");
      winston.debug("(DirGptResponse) - Retrieve public gptkey");
      key = process.env.GPTKEY;
      publicKey = true;
    }

    if (!key) {
      this.logger.error("[OpenAI Response] OpenAI key is mandatory");
      winston.error("(DirGptResponse) gptkey is mandatory");
      let errorMsg = "GPT Response Error: OpenAI API key is undefined";
      await this.#assignErrorAttribute(action, errorMsg);
      if (falseIntent) {
        await this.chatbot.addParameter("flowError", errorMsg);
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    if (publicKey === true) {
      let keep_going = await this.checkQuoteAvailability();
      if (keep_going === false) {
        this.logger.warn("[OpenAI Response] OpenAI tokens quota exceeded");
        await this.chatbot.addParameter("flowError", "GPT Response Error: tokens quota exceeded");
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback();
        return;
      }
    }

    let inputPayload = filled_prompt;
    if (action.promptType === 'json' && typeof filled_prompt === 'string') {
      try {
        inputPayload = JSON.parse(filled_prompt);
      } catch (error) {
        // Keep backward compatibility: if parsing fails, send the raw string.
        winston.warn("(DirGptResponse) promptType=json but prompt is not valid JSON. Sending raw prompt string.");
      }
    }

    let json = { input: inputPayload };

    if (filled_response_id) {
      if (filled_response_id.startsWith('pmpt_')) {
        json.prompt = { id: filled_response_id };
      } else if (!filled_response_id.startsWith('resp_')) {
        // Plain string → model name. (resp_ values are handled via previous_response_id.)
        json.model = filled_response_id;
      }
    }

    if (useConversation) {
      // Conversations methodology: keep the thread server-side via a conversation id.
      // Mutually exclusive with previous_response_id, so that field is not sent here.
      if (!conversation_id) {
        conversation_id = await this.#createConversation(openai_base, key);
        if (!conversation_id) {
          this.logger.warn("[OpenAI Response] Could not create a conversation; proceeding without thread state");
        }
      }
      if (conversation_id) {
        json.conversation = conversation_id;
      }
    } else if (previous_response_id) {
      json.previous_response_id = previous_response_id;
    }

    if (!json.model && !json.prompt && !json.previous_response_id) {
      json.model = process.env.OPENAI_RESPONSES_MODEL || "gpt-4o-mini";
    }

    winston.debug("(DirGptResponse) json: ", json);

    const HTTPREQUEST = {
      url: openai_url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      json: json,
      method: 'POST'
    };
    winston.debug("(DirGptResponse) HttpRequest: ", HTTPREQUEST);

    httpUtils.request(
      HTTPREQUEST, async (err, resbody) => {
        if (err) {
          winston.debug("(DirGptResponse) openai err: ", err);
          winston.debug("(DirGptResponse) openai err: " + (err.response?.data?.error?.message || err.message));
          let errorMsg = err.response?.data?.error?.message || err.message || "Unknown OpenAI error";
          this.logger.error("[OpenAI Response] Responses API error: ", errorMsg);

          await this.#assignErrorAttribute(action, errorMsg);

          if (falseIntent) {
            await this.chatbot.addParameter("flowError", "GPT Response Error: " + errorMsg);
            await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        } else {
          winston.debug("(DirGptResponse) resbody: ", resbody);

          // Extract text from OpenAI Responses API output
          answer = this.#extractResponseText(resbody);

          this.logger.native("[OpenAI Response] answer: ", answer);

          // Store the response ID for potential multi-turn usage
          if (resbody.id && this.context.tdcache) {
            await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, "responseId", resbody.id);
          }

          // Store the conversation ID under the (per-prompt namespaced) conversation attribute so
          // the next turn reuses the same thread automatically (mirrors how `responseId` is stored).
          if (useConversation && this.context.tdcache) {
            const newConversationId = this.#extractConversationId(resbody, conversation_id);
            if (newConversationId) {
              await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, conversationAttributeName, newConversationId);
            }
          }

          await this.#assignResultAttribute(action, answer);

          if (publicKey === true && resbody.usage) {
            let tokens_usage = {
              tokens: resbody.usage.total_tokens,
              model: resbody.model
            };
            this.updateQuote(tokens_usage);
          }

          if (trueIntent) {
            await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        }
      }
    );
  }

  #extractResponseText(resbody) {
    try {
      if (resbody.output && Array.isArray(resbody.output)) {
        for (const item of resbody.output) {
          if (item.type === 'message' && item.content && Array.isArray(item.content)) {
            for (const content of item.content) {
              if (content.type === 'output_text' && content.text) {
                return content.text;
              }
            }
          }
        }
      }
      // Fallback: return stringified output
      if (resbody.output_text) {
        return resbody.output_text;
      }
      return JSON.stringify(resbody.output || resbody);
    } catch (e) {
      winston.error("(DirGptResponse) Error extracting response text: ", e);
      return "No answer.";
    }
  }

  async #createConversation(openai_base, key) {
    return new Promise((resolve) => {
      const HTTPREQUEST = {
        url: openai_base + "/conversations",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
        },
        json: {},
        method: 'POST'
      };
      winston.debug("(DirGptResponse) create conversation HttpRequest ", HTTPREQUEST);
      httpUtils.request(HTTPREQUEST, (err, resbody) => {
        if (err) {
          winston.error("(DirGptResponse) create conversation err: " + (err.response?.data?.error?.message || err.message));
          resolve(null);
        } else {
          resolve((resbody && resbody.id) ? resbody.id : null);
        }
      });
    });
  }

  #extractConversationId(resbody, fallback) {
    const conv = resbody ? resbody.conversation : null;
    if (conv) {
      if (typeof conv === 'string') {
        return conv;
      }
      if (typeof conv === 'object' && conv.id) {
        return conv.id;
      }
    }
    return fallback || null;
  }

  #resolveActionValue(valueOrRef, requestVariables, filler, fallbackToRaw = false) {
    if (!valueOrRef || typeof valueOrRef !== 'string') {
      return null;
    }

    const rawValue = valueOrRef.trim();
    if (!rawValue) {
      return null;
    }

    if (rawValue.includes('{{') && rawValue.includes('}}')) {
      const filled = filler.fill(rawValue, requestVariables);
      return (filled && typeof filled === 'string' && filled.trim() !== '') ? filled.trim() : null;
    }

    if (requestVariables && Object.prototype.hasOwnProperty.call(requestVariables, rawValue)) {
      const attrValue = requestVariables[rawValue];
      if (attrValue !== undefined && attrValue !== null && String(attrValue).trim() !== '') {
        return String(attrValue).trim();
      }
      return null;
    }

    // Fallback: evaluate as a potential filled string.
    const filled = filler.fill(rawValue, requestVariables);
    if (filled && typeof filled === 'string' && filled.trim() !== '' && filled !== rawValue) {
      return filled.trim();
    }

    return fallbackToRaw ? rawValue : null;
  }

  async #executeCondition(result, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, callback) {
    let trueIntentDirective = null;
    if (trueIntent) {
      trueIntentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
    }
    let falseIntentDirective = null;
    if (falseIntent) {
      falseIntentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
    }
    if (result === true) {
      if (trueIntentDirective) {
        this.intentDir.execute(trueIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        winston.debug("(DirGptResponse) No trueIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
    else {
      if (falseIntentDirective) {
        this.intentDir.execute(falseIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        winston.debug("(DirGptResponse) No falseIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
  }

  async #assignResultAttribute(action, answer) {
    winston.debug("(DirGptResponse) assignResultAttribute answer: " + answer);
    if (this.context.tdcache) {
      if (action.assignResultTo && answer) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignResultTo, answer);
      }
    }
  }

  async #assignErrorAttribute(action, error) {
    winston.debug("(DirGptResponse) assignErrorAttribute error: " + error);
    if (this.context.tdcache) {
      if (action.assignErrorTo && error) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignErrorTo, error);
      }
    }
  }

  async getKeyFromKbSettings() {
    return new Promise((resolve) => {

      const KB_HTTPREQUEST = {
        url: this.API_ENDPOINT + "/" + this.context.projectId + "/kbsettings",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      };
      winston.debug("(DirGptResponse) KB HttpRequest ", KB_HTTPREQUEST);

      httpUtils.request(
        KB_HTTPREQUEST, async (err, resbody) => {
          if (err) {
            winston.error("(DirGptResponse) Get KnowledgeBase err:", err.message);
            resolve(null);
          } else {
            if (!resbody.gptkey) {
              resolve(null);
            } else {
              resolve(resbody.gptkey);
            }
          }
        }
      );
    });
  }

  async checkQuoteAvailability() {
    return new Promise((resolve) => {

      const HTTPREQUEST = {
        url: this.API_ENDPOINT + "/" + this.context.projectId + "/quotes/tokens",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      };
      winston.debug("(DirGptResponse) check quote availability HttpRequest ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            resolve(true);
          } else {
            if (resbody.isAvailable === true) {
              resolve(true);
            } else {
              resolve(false);
            }
          }
        }
      );
    });
  }

  async updateQuote(tokens_usage) {
    return new Promise((resolve, reject) => {

      const HTTPREQUEST = {
        url: this.API_ENDPOINT + "/" + this.context.projectId + "/quotes/incr/tokens",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        json: tokens_usage,
        method: "POST"
      };
      winston.debug("(DirGptResponse) update quote HttpRequest ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, async (err, resbody) => {
          if (err) {
            winston.debug("(DirGptResponse) Increment tokens quote err: ", err);
            reject(false);
          } else {
            winston.debug("(DirGptResponse) Increment token quote resbody: ", resbody);
            resolve(true);
          }
        }
      );
    });
  }

}

module.exports = { DirGptResponse };
