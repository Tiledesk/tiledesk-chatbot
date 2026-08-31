const http = require('../utils/http');
const winston = require('../utils/winston');
const { brevoEndpoint } = require('../config/endpoints');

/**
 * Brevo (ex Sendinblue) contact API.
 *
 *   POST {BREVO_ENDPOINT || https://api.brevo.com/v3}/contacts
 *
 * Extracted verbatim from DirBrevo, which built the url, the `api-key` header
 * and the contact envelope inline. Brevo answers a create with 201 and an
 * update with 200, so BOTH are accepted here - this is a per-vendor fact, not
 * a shared convention, and it deliberately differs from the other services.
 *
 * `createContact` never throws and never interprets the response: it hands the
 * raw `{err, resbody}` back so DirBrevo keeps its own status/error branching
 * (which digs `err.response.status` and `err.response.data.message` out of the
 * axios error) exactly as before.
 */

const ACCEPTED_STATUS_CODES = [200, 201];

class BrevoService {

  constructor() { }

  /**
   * Create (or update) a Brevo contact.
   *
   * The constant envelope around the contact - the blacklist flags, the
   * `listIds: [0]`, the `smtpBlacklistSender` placeholder - is Brevo's request
   * shape, so it lives here; the caller only decides the email and the
   * attributes. Field ORDER is preserved from the original literal.
   *
   * @param {string} email          the contact's email address
   * @param {object} attributes     the remaining body parameters, sent as Brevo attributes
   * @param {string} key            the Brevo api key, sent as the `api-key` header
   * @param {string} [caller]       log prefix, e.g. "(DirBrevo)"
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async createContact(email, attributes, key, caller = "(BrevoService)") {
    return new Promise((resolve) => {

      const json = {
        email: email,
        attributes: attributes,
        "emailBlacklisted": false,
        "smsBlacklisted": false,
        "listIds": [
          0
        ],
        "updateEnabled": false,
        "smtpBlacklistSender": [
          "info@mytest.com"
        ]
      }

      const HTTPREQUEST = {
        url: brevoEndpoint() + '/contacts',
        headers: {
          'api-key': key,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        json: json,
        method: "POST"
      }
      winston.debug(caller + " HttpRequest ", HTTPREQUEST);

      http.request(
        HTTPREQUEST,
        (err, resbody) => {
          resolve({ err: err, resbody: resbody });
        },
        { acceptedStatusCodes: ACCEPTED_STATUS_CODES }
      );
    })
  }

}

const brevoService = new BrevoService();
module.exports = brevoService;
