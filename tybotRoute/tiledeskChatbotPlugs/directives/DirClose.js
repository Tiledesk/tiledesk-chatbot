
const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const { TiledeskChatbotConst } = require("../../engine/TiledeskChatbotConst");
const winston = require('../../utils/winston');
const { Logger } = require("../../Logger");

class DirClose {

    constructor(context) {
        if (!context) {
            throw new Error('context object is mandatory.');
        }
        this.context = context;
        this.requestId = context.requestId;
        this.chatbot = context.chatbot;
        this.API_ENDPOINT = context.API_ENDPOINT;
        
        this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
        this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
    }
    
    execute(directive, callback) {
        this.logger.info("[Close] Executing action");
        winston.verbose("Execute Close directive");
        this.tdClient.closeRequest(this.requestId, async (err) => {
            if (err) {
                this.logger.error("[Close] Closing request");
                winston.error("(DirClose) Error: ", err);
            }
            else {
                this.logger.info("[Close] Request closed");
                await this.chatbot.deleteParameter(TiledeskChatbotConst.USER_INPUT);
            }
            this.logger.info("[Close] Action completed");
            callback();
        });
    }

  }
  
  module.exports = { DirClose };