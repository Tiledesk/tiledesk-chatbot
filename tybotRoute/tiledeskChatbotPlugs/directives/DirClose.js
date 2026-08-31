
const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const { TiledeskChatbotConst } = require("../../engine/TiledeskChatbotConst");
const winston = require('../../utils/winston');
const { BaseDirective } = require("../BaseDirective");

class DirClose extends BaseDirective {

    constructor(context) {
      super(context);
      this.chatbot = context.chatbot;

      this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
    }

    execute(directive, callback) {
        winston.verbose("Execute Close directive");
        this.tdClient.closeRequest(this.requestId, async (err) => {
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
        });
    }

  }
  
  module.exports = { DirClose };