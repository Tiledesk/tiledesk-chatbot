const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const { whatsappEndpoint } = require('../config/endpoints');

/**
 * The Whatsapp module broadcast endpoint.
 *
 *   POST {WHATSAPP_ENDPOINT || API_ENDPOINT + "/modules/whatsapp/api"}/tiledesk/broadcast
 *
 * DirSendWhatsapp and DirWhatsappByAttribute each built this request inline.
 * The two copies were identical in every respect that reaches the wire - the
 * endpoint fallback, the path, the method, the single Content-Type header and
 * the body being handed straight to `json` - and differed ONLY in what they did
 * with the response:
 *
 *   DirSendWhatsapp        branches on err / resbody.success === true / other,
 *                          driving trueIntent / falseIntent.
 *   DirWhatsappByAttribute resolves or rejects a promise and forwards
 *                          (err) or (null, resbody) to its callback.
 *
 * Only the request construction is shared here. `broadcast` therefore never
 * throws and never interprets the body: it hands both `err` and `resbody` back
 * so each directive keeps its own - different - response handling verbatim.
 */
class WhatsappService {

  constructor() { }

  /**
   * The Whatsapp module base url, resolved at call time.
   * Exposed so call sites can log it exactly where they logged it before.
   * @returns {string}
   */
  apiUrl() {
    return whatsappEndpoint();
  }

  /**
   * POST a broadcast payload to the Whatsapp module.
   *
   * @param {*} payload         request body, sent as-is
   * @param {string} [caller]   log prefix, e.g. "(DirSendWhatsapp)"
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async broadcast(payload, caller = "(WhatsappService)") {
    return new Promise((resolve) => {

      const HTTPREQUEST = {
        url: this.apiUrl() + "/tiledesk/broadcast",
        headers: {
          'Content-Type': 'application/json'
        },
        json: payload,
        method: 'POST'
      }
      winston.debug(caller + " HttpRequest:  ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, (err, resbody) => {
          resolve({ err: err, resbody: resbody });
        }
      )
    })
  }

}

const whatsappService = new WhatsappService();
module.exports = whatsappService;
