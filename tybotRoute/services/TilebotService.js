const httpUtils = require("../utils/HttpUtils");
const winston = require('../utils/winston');
const ExecutionRecorder = require('../executions/ExecutionRecorder');
// L'endpoint dei salti fra blocchi (`/ext`, `/exec`). Vale, nell'ordine: il `TILEBOT_ENDPOINT`
// passato a `startApp`, la variabile d'ambiente, l'endpoint che `startApp` ha ricavato da
// `API_ENDPOINT`, infine l'ambiente `API_ENDPOINT`. Prima (14/10/2026) il modulo leggeva solo
// l'ambiente e ignorava le impostazioni di `startApp`: un server che avvia il motore con un
// endpoint diverso dall'ambiente mandava i salti al posto sbagliato.
let configuredEndpoint = null;
let computedEndpoint = null;

/**
 * Execution tracing, for both block-jump posts (`/ext` and `/exec`): inside a traced action the block
 * exit is recorded before the jump is posted. Synchronous here, so onJump runs before the caller's own
 * callback. Off (no traced action): beforeJump returns undefined and the post goes out right away as before.
 */
function postJump(post, message, callback, label) {
    const recorded = ExecutionRecorder.beforeJump(message);
    if (recorded === 'skip') {
        // hard stop: the aborted action's jump (e.g. its error exit) is never posted; its
        // caller goes on as if it had been, and the chain stops at the plug's callback
        winston.verbose("(TilebotService) execution aborted: jump not posted");
        setImmediate(() => { if (callback) callback(null, { success: true }); });
        return;
    }
    if (!recorded) {
        post();
        return;
    }
    recorded
        .catch((err) => winston.warn("(TilebotService) beforeJump failed: " + (err && err.message)))
        .then(post)
        .catch((err) => {
            // post() threw synchronously (the untraced path would have thrown to the caller)
            winston.error("(TilebotService) " + label + " error: ", err);
            if (callback) {
                callback(err);
            }
        });
}

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
        const post = () => httpUtils.request(
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
        postJump(post, message, callback, 'sendMessageToBot');
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
        const post = () => httpUtils.request(
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
        // block jumps arrive on /exec (DirIntent): traced like the /ext ones
        postJump(post, message, callback, 'executeBlock');
    }
}

let tilebotService = new TilebotService();
module.exports = tilebotService;