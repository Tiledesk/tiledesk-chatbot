const axios = require("axios").default;
const https = require("https");

/**
 * Shared HTTP helper for directives.
 *
 * This is the extraction of the `#myrequest` private method that was copy-pasted
 * into several directives. The only *genuine* difference between those copies was
 * which response status codes count as a success, so that is an explicit parameter
 * here instead of being hardcoded (and silently unified).
 *
 * Behaviour is preserved from the original copies (one deliberate deviation,
 * called out after the list):
 *  - `https:` URLs get an `https.Agent({ rejectUnauthorized: false })`
 *  - `options.json` is mapped onto `axios_options.data` when it is not `null`
 *    (note: `undefined !== null`, so an absent `json` still sets `data: undefined`)
 *  - a non accepted status (or an empty body) invokes `callback(new Error(...), null)`
 *  - a rejected request invokes `callback(error, null)` with the raw axios error
 *
 * ONE deliberate deviation from the originals: the response-body and the
 * request-body branches are now mutually exclusive (`else if`). The copies
 * tested them independently, so an accepted response that carried BOTH a body
 * and `fallbackToRequestData: true` invoked the callback TWICE. See
 * `fallbackToRequestData` below.
 *
 * @param {object} options                        request description
 * @param {string} options.url
 * @param {string} options.method
 * @param {object} [options.params]
 * @param {object} [options.headers]
 * @param {*}      [options.json]                 request body
 * @param {function(Error|null, *):void} callback
 * @param {object} [config]
 * @param {number[]} [config.acceptedStatusCodes=[200]]
 *        Status codes treated as a success. Defaults to 200 only.
 * @param {boolean} [config.fallbackToRequestData=false]
 *        Preserves DirCustomerio's `res.data || res.config.data` shape: when the
 *        response carries no body the *request* body is handed back instead.
 *        Off by default because the other callers only ever looked at `res.data`.
 *        The `||` is now honoured literally: the request body is a FALLBACK, not
 *        a second callback. The original code ran the two `if`s in sequence, so
 *        an accepted 200 that DID carry a body called back once with the
 *        response and again with the request. Only Customer.io ever passed this
 *        flag, and its real 204 answers are empty, so nothing else changes.
 * @param {string} [config.statusErrorMessage]
 *        Message of the Error raised on a non accepted status. Defaults to
 *        "Response status is not <first accepted code>".
 */
function request(options, callback, config = {}) {
  const acceptedStatusCodes = config.acceptedStatusCodes || [200];
  const fallbackToRequestData = config.fallbackToRequestData === true;
  const statusErrorMessage =
    config.statusErrorMessage || "Response status is not " + acceptedStatusCodes[0];

  let axios_options = {
    url: options.url,
    method: options.method,
    params: options.params,
    headers: options.headers
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
      const statusAccepted = !!res && acceptedStatusCodes.includes(res.status);
      const requestData = fallbackToRequestData ? res && res.config.data : null;
      if (statusAccepted && (res.data || requestData)) {
        if (callback) {
          if (res.data) {
            callback(null, res.data);
          }
          else if (requestData) {
            callback(null, requestData);
          }
        }
      }
      else {
        if (callback) {
          callback(new Error(statusErrorMessage), null);
        }
      }
    })
    .catch((error) => {
      if (callback) {
        callback(error, null);
      }
    });
}

module.exports = { request };
