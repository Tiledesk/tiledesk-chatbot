const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Logger } = require("../../Logger");
const winston = require('../../utils/winston');

/**
 * Reads the rating of the conversation and its comment into two flow variables.
 * action.assignRatingTo: the variable for the rating (1-5)
 * action.assignRatingMessageTo: the variable for the comment
 * A value the conversation does not have removes its variable, so an older read is not left behind.
 */
class DirGetRating {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.API_ENDPOINT = this.context.API_ENDPOINT;

    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
  }

  execute(directive, callback) {
    winston.verbose("Execute GetRating action");
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
    this.go(action, () => {
      this.logger.native("[Get Rating] Executed");
      callback();
    })
  }

  async go(action, callback) {
    winston.debug("(DirGetRating) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirGetRating) Error: tdcache is mandatory");
      callback();
      return;
    }

    let request;
    try {
      request = await this.tdClient.getRequestById(this.requestId);
    }
    catch (err) {
      this.logger.error("[Get Rating] Error reading the conversation:", err?.message);
      winston.error("(DirGetRating) Error reading the conversation: " + err?.message);
      await TiledeskChatbot.addParameterStatic(this.tdcache, this.requestId, "flowError", "Get rating Error: " + (err?.message || err));
      callback();
      return;
    }

    await this.assign(action.assignRatingTo, request?.rating);
    await this.assign(action.assignRatingMessageTo, request?.rating_message);
    this.logger.native("[Get Rating] Rating:", request?.rating, "message:", request?.rating_message);
    callback();
  }

  async assign(variable, value) {
    if (!variable) {
      return;
    }
    if (value === undefined || value === null || value === '') {
      await TiledeskChatbot.deleteParameterStatic(this.tdcache, this.requestId, variable);
    }
    else {
      await TiledeskChatbot.addParameterStatic(this.tdcache, this.requestId, variable, value);
    }
  }
}

module.exports = { DirGetRating };
