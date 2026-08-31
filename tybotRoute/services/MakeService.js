const axios = require("axios").default;
const https = require("https");
const winston = require('../utils/winston');
const { makeEndpoint } = require('../config/endpoints');

/**
 * Make (ex Integromat) webhook trigger.
 *
 *   POST {MAKE_ENDPOINT}/make/   when the override is configured (tests only)
 *   POST {the bot author's webhook url}   otherwise
 *
 * Make is the odd one out and stays that way ON PURPOSE. Every other service
 * here goes through utils/http.js or utils/HttpUtils, which check the response
 * status and hand `res.data` back. DirMake's request did NEITHER, so it kept a
 * private `#myrequest` rather than being folded into the shared helper. That
 * implementation is moved here BYTE FOR BYTE, quirks included:
 *
 *  - NO status check at all. Any response Make sends - 200, 404, 500 - reaches
 *    the caller as a success.
 *  - the WHOLE axios response is handed back, not `res.data`; the caller reads
 *    `res.status` and `res.error` off it.
 *  - a REJECTED request is delivered in the SUCCESS position: the catch block
 *    swallows the axios error into a synthetic `{status, data: null, error}`
 *    payload and calls back with a null error. `err` is therefore ALWAYS null;
 *    the destructured `{err, res}` shape is kept only so the call site reads
 *    like every other service here, and so the directive's `if (err)` branch -
 *    which is consequently dead code, exactly as it was before this move -
 *    survives untouched.
 *  - `timeout: 20000`, which no other request in this codebase sets.
 *
 * Normalising any of that would change behaviour, so none of it is normalised.
 */
class MakeService {

  constructor() { }

  /**
   * POST a body to a Make webhook.
   *
   * The url selection is Make's, not the caller's: when MAKE_ENDPOINT is set
   * the bot author's url is IGNORED and the request goes to
   * `${MAKE_ENDPOINT}/make/` instead. That variable is a test hook and must not
   * be defined in production.
   *
   * @param {string} webhookUrl   the bot author's webhook url, used when no override is set
   * @param {object} body         the request body, sent as-is
   * @param {string} [caller]     log prefix, e.g. "(DirMake)"
   * @returns {Promise<{err: null, res: *}>} never rejects; `err` is always null (see above)
   */
  async trigger(webhookUrl, body, caller = "(MakeService)") {
    return new Promise((resolve) => {

      const make_base_url = makeEndpoint();
      let url;
      if (make_base_url) {
        url = make_base_url + "/make/";
      } else {
        url = webhookUrl;
      }

      const HTTPREQUEST = {
        url: url,
        headers: {
          'Content-Type': 'application/json'
        },
        json: body,
        method: "POST"
      }
      winston.debug(caller + " Make HttpRequest ", HTTPREQUEST);

      this.#myrequest(HTTPREQUEST, (err, res) => {
        resolve({ err: err, res: res });
      });
    })
  }

  /**
   * DirMake's private request implementation, moved here unchanged. See the
   * class comment for why it is not utils/http.js.
   */
  #myrequest(options, callback) {
    let axios_options = {
      url: options.url,
      method: options.method,
      params: options.params,
      headers: options.headers,
      timeout: 20000
    }
    if (options.json !== null) {
      axios_options.data = options.json
    }
    if (options.url.startsWith("https:")) {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });
      axios_options.httpsAgent = httpsAgent;
    }
    axios(axios_options)
      .then((res) => {
        if (callback) {
          callback(null, res);
        }

      })
      .catch((err) => {
        // FIX THE STRINGIFY OF CIRCULAR STRUCTURE BUG - END;
        if (callback) {
          let status = 1000;
          let cache = [];
          let str_error = JSON.stringify(err, function (key, value) { // try to use a separate function
            if (typeof value === 'object' && value != null) {
              if (cache.indexOf(value) !== -1) {
                return;
              }
              cache.push(value);
            }
            return value;
          });
          let error = JSON.parse(str_error) // "status" disappears without this trick
          let errorMessage = JSON.stringify(error);
          if (error.status) {
            status = error.status;
          }
          if (error.message) {
            errorMessage = error.message;
          }
          callback(
            null, {
            status: status,
            data: null,
            error: errorMessage
          }
          );
        }
      });
  }

}

const makeService = new MakeService();
module.exports = makeService;
