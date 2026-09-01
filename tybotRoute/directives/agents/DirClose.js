
const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const { TiledeskChatbotConst } = require("../../engine/TiledeskChatbotConst");
const winston = require('../../utils/winston');
const { BaseDirective } = require("../BaseDirective");
const { Directives } = require('../Directives');

class DirClose extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.CLOSE];

    constructor(context) {
      super(context);
      this.chatbot = context.chatbot;

      this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
    }

    execute(directive, callback) {
        winston.verbose("Execute Close directive");
        // Promise.resolve(...) rather than a direct .catch: closeRequest()
        // returns a promise in production, but a test double may return nothing.
        Promise.resolve(this.tdClient.closeRequest(this.requestId, async (err) => {
            if (err) {
                this.logger.error("[Close] Closing request");
                winston.error("(DirClose) Error: ", err);
            }
            else {
                this.logger.native("[Close] Request closed");
                await this.chatbot.deleteParameter(TiledeskChatbotConst.USER_INPUT);
            }
            this.logger.native("[Close] Executed");
            callback();
        })).catch((err) => {
            // closeRequest() BOTH rejects its promise and invokes the callback
            // on a non-2xx answer. The callback above already logs and releases
            // the flow; without this catch the rejection went unhandled and
            // killed the process under Node's default --unhandled-rejections=throw,
            // which also made the error branch above unreachable in practice.
            winston.debug("(DirClose) closeRequest rejected, already handled in the callback: ", err && err.message);
        });
    }

  }
  
  module.exports = { DirClose };