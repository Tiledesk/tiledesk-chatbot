const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const { Logger } = require("../../Logger");
const { SubagentStack } = require("../SubagentStack");
const winston = require('../../utils/winston.js');
const requestService = require("../../services/RequestService.js");
const tilebotService = require("../../services/TilebotService.js");
const { v4: uuidv4 } = require('uuid');

class DirReturnStack {

    constructor(context) {
        if (!context) {
            throw new Error('context object is mandatory');
        }
        this.context = context;
        this.requestId = context.requestId;
        this.API_ENDPOINT = context.API_ENDPOINT;

        this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
        this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
    }

    execute(directive, callback) {
        winston.verbose("Execute ReturnStack directive");
        let action;
        if (directive.action) {
            action = directive.action;
        }
        else {
            this.logger.error("Incorrect action for ", directive.name, directive);
            winston.warn("DirReturnStack Incorrect directive: ", directive);
            callback();
            return;
        }
        this.go(action, (stop) => {
            this.logger.native("[Return Stack] Executed");
            callback(stop);
        })
    }

    async go(action, callback) {
        winston.debug("(DirReturnStack) Action: ", action);
        const subagentStack = new SubagentStack({ tdCache: this.context.tdcache });
        const data = await subagentStack.pop(this.requestId);
        if (!data?.parentId) {
            this.logger.error("(ReturnStack) No parentId found");
            callback(true);
            return;
        }
        try {
            await requestService.replaceBot(this.context.projectId, this.requestId, { id: data.parentId }, this.context.token);
        } catch (error) {
            winston.error("(DirReturnStack) error: ", error);
            this.logger.error("(ReturnStack) Invoke subagent error: ", error);
            callback(true);
            return;
        }

        if (data.nextBlock?._tdActionType === "intent" && data.nextBlock?.intentName) {

            let intent_command_request = {
                "payload": {
                    "_id": uuidv4(),
                    "senderFullname": "_tdinternal",
                    "type": "text",
                    "sender": "_tdinternal",
                    "recipient": this.requestId,
                    "text": "/" + data.nextBlock.intentName,
                    "id_project": this.context.projectId,
                    "request": {
                        "request_id": this.requestId,
                        "id_project": this.context.projectId,
                        "draft": false
                    }
                },
                "token": this.context.token
            }

            tilebotService.sendMessageToBot(
                intent_command_request,
                data.parentId,
                (err) => {
                    if (err) {
                        winston.error("(DirReturnStack) error: ", err);
                        this.logger.error("(ReturnStack) Send message to bot error: ", err);
                        callback(true);
                        return;
                    }
                    callback(true);
                }
            );
            return;
        }


        callback(true);
    }
}

module.exports = { DirReturnStack };
