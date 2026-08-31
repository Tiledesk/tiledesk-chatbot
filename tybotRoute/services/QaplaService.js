const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const { qaplaEndpoint } = require('../config/endpoints');

/**
 * Qapla shipment tracking API.
 *
 *   GET {QAPLA_ENDPOINT || https://api.qapla.it/1.2}/getShipment/?apiKey=…&trackingNumber=…
 *
 * Extracted verbatim from DirQapla. Note the credential travels as a QUERY
 * PARAMETER, not a header - that is Qapla's api, kept as-is.
 *
 * DirQapla never had a private request implementation: it already shared
 * utils/HttpUtils, which accepts ANY 2xx. That is preserved by keeping
 * httpUtils here rather than moving to utils/http.js, whose default is 200
 * only.
 *
 * `getShipment` never throws and never interprets the body: the raw
 * `{err, resbody}` goes back so DirQapla keeps its own digging through
 * `resbody.getShipment.shipments[0].status.qaplaStatus.status` untouched.
 */
class QaplaService {

  constructor() { }

  /**
   * The Qapla API base url, resolved at call time.
   * Exposed so the call site can log it where it logged it before.
   * @returns {string}
   */
  apiUrl() {
    return qaplaEndpoint();
  }

  /**
   * Look a shipment up by tracking number.
   *
   * @param {string} apiKey           the Qapla api key, sent as a query parameter
   * @param {string} trackingNumber   the tracking number, sent as a query parameter
   * @param {string} [caller]         log prefix, e.g. "(DirQapla)"
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async getShipment(apiKey, trackingNumber, caller = "(QaplaService)") {
    return new Promise((resolve) => {

      const HTTPREQUEST = {
        url: this.apiUrl() + "/getShipment/",
        headers: {
          'Content-Type': 'application/json'
        },
        params: {
          apiKey: apiKey,
          trackingNumber: trackingNumber
        },
        method: "GET"
      }
      winston.debug(caller + " HttpRequest ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST,
        (err, resbody) => {
          resolve({ err: err, resbody: resbody });
        }
      );
    })
  }

}

const qaplaService = new QaplaService();
module.exports = qaplaService;
