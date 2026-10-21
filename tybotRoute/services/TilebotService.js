const httpUtils = require("../utils/HttpUtils");
const winston = require('../utils/winston');
// L'endpoint dei salti fra blocchi (`/ext`, `/exec`). Vale, nell'ordine: il `TILEBOT_ENDPOINT`
// passato a `startApp`, la variabile d'ambiente, l'endpoint che `startApp` ha ricavato da
// `API_ENDPOINT`, infine l'ambiente `API_ENDPOINT`. Prima (14/10/2026) il modulo leggeva solo
// l'ambiente e ignorava le impostazioni di `startApp`: un server che avvia il motore con un
// endpoint diverso dall'ambiente mandava i salti al posto sbagliato.
let configuredEndpoint = null;
let computedEndpoint = null;

class TilebotService {

    constructor() { }

    /** Chiamato da `startApp`: `configured` e' `settings.TILEBOT_ENDPOINT`, `computed` il ripiego da `API_ENDPOINT`. */
    setEndpoint(configured, computed) {
        configuredEndpoint = configured || null;
        computedEndpoint = computed || null;
    }

    endpoint() {
        return configuredEndpoint || process.env.TILEBOT_ENDPOINT || computedEndpoint || `${process.env.API_ENDPOINT}/modules/tilebot`;
    }

    /**
     * A stub to send message to the "ext/botId" endpoint, hosted by tilebot on:
     * /${TILEBOT_ROUTE}/ext/${botId}
     *
     * @param {Object} message. The message to send
     * @param {string} botId. Tiledesk botId
     * @param {string} token. User token
     */
    sendMessageToBot(message, botId, callback) {
        const url = `${this.endpoint()}/ext/${botId}`;
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
        const url = `${this.endpoint()}/exec/${botId}`;
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