const http = require('../utils/http');
const winston = require('../utils/winston');
const { hubspotEndpoint } = require('../config/endpoints');

/**
 * Hubspot CRM contacts API.
 *
 *   POST {HUBSPOT_ENDPOINT || https://api.hubapi.com/crm/v3/}objects/contacts/batch/create
 *
 * Note the missing separator: the base url's trailing slash IS the separator,
 * exactly as DirHubspot built it inline. Hubspot answers a batch create with
 * 201, but 200 is accepted too - a per-vendor decision carried over unchanged.
 *
 * `batchCreateContacts` never throws and never interprets the response: the raw
 * `{err, resbody}` goes back so DirHubspot keeps its own branching (which reads
 * `err.response.status` and `err.response.data.message`) untouched.
 */

const ACCEPTED_STATUS_CODES = [200, 201];

class HubspotService {

  constructor() { }

  /**
   * Create one contact through the batch endpoint.
   *
   * The `{ inputs: [ { properties, associations: [] } ] }` envelope is
   * Hubspot's request shape, so it lives here; the caller only supplies the
   * contact properties. A single-element batch is what DirHubspot always sent.
   *
   * @param {object} properties   the contact properties
   * @param {string} key          the private app token, sent as `Authorization: Bearer <key>`
   * @param {string} [caller]     log prefix, e.g. "(DirHubspot)"
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async batchCreateContacts(properties, key, caller = "(HubspotService)") {
    return new Promise((resolve) => {

      const json = {
        inputs: [
          { properties: properties, associations: [] }
        ]
      }

      const HTTPREQUEST = {
        url: hubspotEndpoint() + 'objects/contacts/batch/create',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
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

const hubspotService = new HubspotService();
module.exports = hubspotService;
