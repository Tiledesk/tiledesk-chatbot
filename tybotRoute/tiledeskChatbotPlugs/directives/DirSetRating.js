const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
const { Logger } = require("../../Logger");
const winston = require('../../utils/winston');

/**
 * Sets the rating (1-5) of the conversation.
 * action.rating: the value, a template that may hold {{variables}}
 * action.ratingMessage: optional comment of the rating, a template that may hold {{variables}}; empty is not sent
 * action.forceUpdate: true overwrites a rating already given; otherwise the rating is set only if the conversation has none
 * action.assignErrorTo: optional variable for the reason of a failure; removed on success
 * action.trueIntent / action.falseIntent: the Success exit (rating saved, or kept because already given)
 * and the else exit (invalid value or request failed), with their optional *IntentAttributes
 * action.requestId: optional id of the conversation to rate, a template that may hold {{variables}};
 * empty means the current conversation. A webhook run (`automation-request-...`) has no conversation,
 * so there it must be given (e.g. {{payload.payload.request_id}} from a request.close subscription).
 * action.saveTo: 'rating' (default, also when missing) sets rating / rating_message of the conversation;
 * 'attributes' saves the value as an AI evaluation in the conversation attributes ai_rating / ai_sentiment.
 */
class DirSetRating {

  static SAVE_TO_RATING = 'rating';
  static SAVE_TO_ATTRIBUTES = 'attributes';
  static AI_RATING_KEY = 'ai_rating';
  static AI_SENTIMENT_KEY = 'ai_sentiment';
  static AUTOMATION_PREFIX = 'automation-request-';
  static NO_CONVERSATION_ERROR = "no conversation: in a webhook set the Request ID of the action";

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.API_ENDPOINT = this.context.API_ENDPOINT;

    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
  }

  execute(directive, callback) {
    winston.verbose("Execute SetRating action");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.debug("Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Set Rating] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirSetRating) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirSetRating) Error: tdcache is mandatory");
      callback();
      return;
    }

    const requestVariables = await TiledeskChatbot.allParametersStatic(this.tdcache, this.requestId);
    const filler = new Filler();
    const targetRequestId = DirSetRating.targetRequestId(this.requestId, action, filler, requestVariables);
    if (!targetRequestId) {
      this.logger.error("[Set Rating] No conversation to rate: in a webhook set the Request ID of the action");
      await this.fail(action, DirSetRating.NO_CONVERSATION_ERROR, callback);
      return;
    }

    const filled = filler.fill(action.rating, requestVariables);
    const rating = DirSetRating.parseRating(filled);
    if (rating === null) {
      this.logger.error("[Set Rating] Invalid rating, it must be an integer from 1 to 5:", filled);
      winston.debug("(DirSetRating) invalid rating: " + filled);
      await this.fail(action, "invalid rating '" + filled + "', it must be an integer from 1 to 5", callback);
      return;
    }

    const ratingMessage = DirSetRating.fillMessage(action.ratingMessage, filler, requestVariables);
    if (action.saveTo === DirSetRating.SAVE_TO_ATTRIBUTES) {
      await this.saveToAttributes(action, targetRequestId, rating, ratingMessage, callback);
      return;
    }

    const properties = { rating: rating };
    if (ratingMessage) {
      properties.rating_message = ratingMessage;
    }

    try {
      if (action.forceUpdate !== true) {
        const request = await this.tdClient.getRequestById(targetRequestId);
        if (request && request.rating !== undefined && request.rating !== null) {
          this.logger.native("[Set Rating] The conversation already has a rating, not updated:", request.rating);
          await this.succeed(action, callback);
          return;
        }
      }
      await this.tdClient.updateRequestProperties(targetRequestId, properties);
      this.logger.native("[Set Rating] Rating set to", rating, "on", targetRequestId);
    }
    catch (err) {
      this.logger.error("[Set Rating] Error setting the rating:", err?.message);
      winston.error("(DirSetRating) Error setting the rating: " + err?.message);
      await this.fail(action, err?.message || String(err), callback);
      return;
    }
    await this.succeed(action, callback);
  }

  /**
   * saveTo 'attributes': the evaluation goes to the conversation attributes ai_rating / ai_sentiment
   * (PATCH /requests/:id/attributes, which merges the keys), so the rating the user gives in the widget
   * and the AI evaluation never overwrite each other, and no satisfaction analytics event is emitted.
   * Force update off keeps an ai_rating already saved.
   */
  async saveToAttributes(action, targetRequestId, rating, ratingMessage, callback) {
    const attributes = { [DirSetRating.AI_RATING_KEY]: rating };
    if (ratingMessage) {
      attributes[DirSetRating.AI_SENTIMENT_KEY] = ratingMessage;
    }
    try {
      if (action.forceUpdate !== true) {
        const request = await this.tdClient.getRequestById(targetRequestId);
        const current = request?.attributes?.[DirSetRating.AI_RATING_KEY];
        if (current !== undefined && current !== null) {
          this.logger.native("[Set Rating] The conversation already has an AI rating, not updated:", current);
          await this.succeed(action, callback);
          return;
        }
      }
      await this.updateRequestAttributes(targetRequestId, attributes);
      this.logger.native("[Set Rating] AI rating set to", rating, "on", targetRequestId);
    }
    catch (err) {
      this.logger.error("[Set Rating] Error setting the AI rating:", err?.message);
      winston.error("(DirSetRating) Error setting the AI rating: " + err?.message);
      await this.fail(action, err?.message || String(err), callback);
      return;
    }
    await this.succeed(action, callback);
  }

  /** The client method works with a callback only */
  updateRequestAttributes(requestId, attributes) {
    return new Promise((resolve, reject) => {
      this.tdClient.updateRequestAttributes(requestId, attributes, (err, result) => {
        if (err) {
          reject(err);
        }
        else {
          resolve(result);
        }
      });
    });
  }

  /**
   * The conversation the action works on: the filled action.requestId when given, otherwise the current one.
   * Null when there is none: a webhook run without a Request ID, a Request ID that fills to
   * empty (no fallback to the current conversation, it would rate the wrong one), or a webhook run id.
   */
  static targetRequestId(requestId, action, filler, requestVariables) {
    const template = action?.requestId;
    const hasTemplate = typeof template === 'string' ? template.trim() !== '' : (template !== undefined && template !== null);
    const id = hasTemplate ? DirSetRating.fillMessage(template, filler, requestVariables) : requestId;
    if (!id || id.startsWith(DirSetRating.AUTOMATION_PREFIX)) {
      return null;
    }
    return id;
  }

  /** The rating as an integer from 1 to 5, or null */
  static parseRating(value) {
    if (value === undefined || value === null) {
      return null;
    }
    const s = String(value).trim();
    if (!/^[1-5]$/.test(s)) {
      return null;
    }
    return Number(s);
  }

  /** The filled comment, trimmed, or null when there is nothing to send */
  static fillMessage(template, filler, requestVariables) {
    if (template === undefined || template === null) {
      return null;
    }
    const filled = filler.fill(String(template), requestVariables);
    if (filled === undefined || filled === null) {
      return null;
    }
    const s = String(filled).trim();
    return s === '' ? null : s;
  }

  /** Success exit: an older error left in assignErrorTo is removed */
  async succeed(action, callback) {
    if (action.assignErrorTo) {
      await TiledeskChatbot.deleteParameterStatic(this.tdcache, this.requestId, action.assignErrorTo);
    }
    this.goToExit(action.trueIntent, action.trueIntentAttributes, "true", callback);
  }

  /** else exit: the reason goes to flowError and to assignErrorTo */
  async fail(action, reason, callback) {
    await TiledeskChatbot.addParameterStatic(this.tdcache, this.requestId, "flowError", "Set rating Error: " + reason);
    if (action.assignErrorTo) {
      await TiledeskChatbot.addParameterStatic(this.tdcache, this.requestId, action.assignErrorTo, reason);
    }
    this.goToExit(action.falseIntent, action.falseIntentAttributes, "false", callback);
  }

  /** Moves to the exit's block and stops the current one; without a connected exit the flow goes on */
  goToExit(intent, intentAttributes, label, callback) {
    if (!intent) {
      winston.debug("(DirSetRating) No " + label + " intent specified");
      callback();
      return;
    }
    this.logger.native("[Set Rating] executing " + label + " condition");
    const intentDirective = DirIntent.intentDirectiveFor(intent, intentAttributes);
    // as Web Request V2 and Data Tables: the move is not awaited, the current block stops at once
    this.intentDir.execute(intentDirective, () => {});
    callback(true);
  }
}

module.exports = { DirSetRating };
