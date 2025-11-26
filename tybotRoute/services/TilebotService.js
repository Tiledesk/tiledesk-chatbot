const httpUtils = require("../utils/HttpUtils");
const winston = require('../utils/winston');
const TILEBOT_ENDPOINT = process.env.TILEBOT_ENDPOINT || `${process.env.API_ENDPOINT}/modules/tilebot`

class TilebotService {

    constructor() { }

    /**
     * A stub to send message to the "ext/botId" endpoint, hosted by tilebot on:
     * /${TILEBOT_ROUTE}/ext/${botId}
     *
     * @param {Object} message. The message to send
     * @param {string} botId. Tiledesk botId
     * @param {string} token. User token
     */
    sendMessageToBot(message, botId, callback) {
        const url = `${TILEBOT_ENDPOINT}/ext/${botId}`;
        winston.verbose("sendMessageToBot URL" + url);
        const HTTPREQUEST = {
            url: url,
            headers: {
                'Content-Type': 'application/json'
            },
            json: message,
            method: 'POST'
        };
        httpUtils.request(
            HTTPREQUEST,
            function (err, resbody) {
                if (err) {
                    if (callback) {
                        callback(err);
                    }
                }
                else {
                    if (callback) {
                        callback(null, resbody);
                    }
                }
            }, false
        );
    }

    /**
     * A stub to send message to the "ext/botId" endpoint, hosted by tilebot on:
     * /${TILEBOT_ROUTE}/ext/${botId}
     *
     * @param {Object} message. The message to send
     * @param {string} botId. Tiledesk botId
     * @param {string} token. User token
     */
    executeBlock(message, botId, callback) {
        const url = `${TILEBOT_ENDPOINT}/exec/${botId}`;
        winston.verbose("sendMessageToBot URL" + url);
        const HTTPREQUEST = {
            url: url,
            headers: {
                'Content-Type': 'application/json'
            },
            json: message,
            method: 'POST'
        };
        httpUtils.request(
            HTTPREQUEST,
            function (err, resbody) {
                if (err) {
                    if (callback) {
                        callback(err);
                    }
                }
                else {
                    if (callback) {
                        callback(null, resbody);
                    }
                }
            }, false
        );
    }
}

let tilebotService = new TilebotService();
module.exports = tilebotService;