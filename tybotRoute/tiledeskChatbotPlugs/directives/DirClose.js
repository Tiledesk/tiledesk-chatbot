
const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const { TiledeskChatbotConst } = require("../../models/TiledeskChatbotConst");
const winston = require('../../utils/winston');

class DirClose {

    constructor(context) {
        if (!context) {
            throw new Error('context object is mandatory.');
        }
        this.context = context;
        this.requestId = context.requestId;
        this.chatbot = context.chatbot;
        this.API_ENDPOINT = context.API_ENDPOINT;
        this.log = context.log;

        this.tdClient = new TiledeskClient({
            projectId: this.context.projectId,
            token: this.context.token,
            APIURL: this.API_ENDPOINT,
            APIKEY: "___",
            log: this.log
        });
    }
    
    execute(directive, callback) {
        winston.verbose("Execute Close directive");
        this.tdClient.closeRequest(this.requestId, async (err) => {
            if (err) {
                winston.error("(DirClose) Error: ", err);
            }
            else {
                await this.chatbot.deleteParameter(TiledeskChatbotConst.USER_INPUT);
            }
            callback();
        });
    }

  }
  
  module.exports = { DirClose };