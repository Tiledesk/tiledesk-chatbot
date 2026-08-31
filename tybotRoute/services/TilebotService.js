const httpUtils = require("../utils/HttpUtils");
const winston = require('../utils/winston');
const { tilebotEndpoint } = require('../config/endpoints');

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
        const url = `${tilebotEndpoint()}/ext/${botId}`;
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
        const url = `${tilebotEndpoint()}/exec/${botId}`;
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