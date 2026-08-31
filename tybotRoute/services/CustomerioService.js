const http = require('../utils/http');
const winston = require('../utils/winston');
const { customerioEndpoint } = require('../config/endpoints');

/**
 * Customer.io form submit API.
 *
 *   POST {CUSTOMERIO_ENDPOINT || https://track.customer.io/api/v1}/forms/{formId}/submit
 *
 * Extracted from DirCustomerio, including its two quirks:
 *
 *  - Customer.io answers a successful submit with 204 and an EMPTY body, so
 *    200 and 204 are both accepted and `fallbackToRequestData` hands the
 *    *request* body back to the callback when the response carries none. Both
 *    are per-vendor facts; no other service here does either.
 *  - the error message on a rejected status stays the original
 *    "Response status is not 204".
 *
 * `submitForm` never throws and never interprets the response: the raw
 * `{err, resbody}` goes back so DirCustomerio keeps its own branching (which
 * reads `err.response.status` and `err.response.data.meta.error`) untouched.
 *
 * ONE behaviour change, deliberate. In the original directive the callback ran
 * for the response body AND again for the request body, so an accepted 200 that
 * DID carry a body invoked DirCustomerio's success branch TWICE and re-entered
 * the directive pipeline twice. It now fires exactly once: `utils/http` makes
 * the request-body path an `else if` (Customer.io is its only user), and this
 * `new Promise` would in any case have made a second `resolve` a no-op. The
 * real 204-with-empty-body path is unaffected - it never had a response body to
 * take priority - and no other call site passes `fallbackToRequestData`.
 */

const REQUEST_CONFIG = {
  acceptedStatusCodes: [200, 204],
  fallbackToRequestData: true,
  statusErrorMessage: "Response status is not 204"
};

class CustomerioService {

  constructor() { }

  /**
   * The Customer.io API base url, resolved at call time.
   * Exposed so the call site can log it where it logged it before.
   * @returns {string}
   */
  apiUrl() {
    return customerioEndpoint();
  }

  /**
   * Submit a form.
   *
   * @param {string} formId       the Customer.io form id, interpolated into the path as-is
   * @param {object} data         the form fields, wrapped in Customer.io's `{ data }` envelope
   * @param {string} key          the api key, sent as `authorization: Basic <key>`
   * @param {string} [caller]     log prefix, e.g. "(DirCustomerio)"
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async submitForm(formId, data, key, caller = "(CustomerioService)") {
    return new Promise((resolve) => {

      const json = {
        data: data
      }

      const HTTPREQUEST = {
        url: this.apiUrl() + "/forms/" + formId + "/submit",
        headers: {
          'authorization': 'Basic ' + key,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'User-Agent': 'TiledeskBotRuntime',
          'Accept': '*/*'
        },
        json: json,
        method: "POST"
      }
      winston.debug(caller + " HttpRequest: ", HTTPREQUEST);

      http.request(
        HTTPREQUEST,
        (err, resbody) => {
          resolve({ err: err, resbody: resbody });
        },
        REQUEST_CONFIG
      );
    })
  }

}

const customerioService = new CustomerioService();
module.exports = customerioService;
