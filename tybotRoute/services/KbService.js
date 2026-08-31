const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const { apiEndpoint } = require('../config/endpoints');
const kbSettingsService = require('./KbSettingsService');

class KBService {

  constructor() { }

  /**
   * @deprecated Kept as a thin delegate to KbSettingsService, the single owner
   * of GET /{projectId}/kbsettings. Currently has no callers.
   */
  async getKeyFromKbSettings(id_project, token) {
    return kbSettingsService.getKeyFromKbSettings(id_project, token, "(KbService)");
  }

  /**
   * Look a namespace up by name OR by id, resolving `null` when the lookup
   * fails and `undefined` when it succeeds but nothing matches.
   *
   * DirAddKbContent and DirAskGPTV2 each carried a byte-identical private
   * `getNamespace(name, id)`; the ONLY difference was the winston prefix,
   * which `caller` reproduces. Both call sites test the result with a bare
   * `if (!ns)`, so the undefined-vs-null distinction is invisible to them; it
   * is preserved here rather than "tidied" away.
   *
   * The url was built from the directive's `this.API_ENDPOINT`, which
   * `startApp` seeds from `endpoints.apiEndpoint()` - the same value this
   * resolves.
   *
   * @param {string} id_project
   * @param {string} token      raw JWT (sent as "JWT <token>")
   * @param {string|null} name  when truthy, match on `n.name === name`
   * @param {string|null} id    otherwise, match on `n.id === id`
   * @param {string} [caller]   log prefix, e.g. "DirAskGPTV2"
   * @returns {Promise<object|null|undefined>} never rejects
   */
  async getNamespaceOrNull(id_project, token, name, id, caller = "KbService") {
    return new Promise((resolve) => {
      const HTTPREQUEST = {
        url: apiEndpoint() + "/" + id_project + "/kb/namespace/all",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "GET"
      }
      winston.debug(caller + " get all namespaces HttpRequest", HTTPREQUEST);
      httpUtils.request(
        HTTPREQUEST, async (err, namespaces) => {
          if (err) {
            winston.error(caller + " get all namespaces err: ", err);
            resolve(null)
          } else {
            winston.debug(caller + " get all namespaces resbody: ", namespaces);
            if (name) {
              let namespace = namespaces.find(n => n.name === name);
              resolve(namespace);
            } else {
              let namespace = namespaces.find(n => n.id === id);
              resolve(namespace);
            }

          }
        }
      )
    })
  }

  /**
   * POST /{projectId}/kb - add a piece of content to a namespace.
   *
   * Extracted verbatim from DirAddKbContent. The raw `{err, resbody}` goes
   * back so the directive keeps its own three-way branch (`err`,
   * `resbody.success === true`, and the else that does the same thing as the
   * success case). It is deliberately NOT folded into the add*Question
   * methods above: those reject, this one does not, and DirAddKbContent's
   * error branch reads `err?.response` rather than the error itself.
   *
   * @param {string} id_project
   * @param {string} token       raw JWT (sent as "JWT <token>")
   * @param {object} json        the request body, assembled by the caller
   * @param {string} [caller]    log prefix, e.g. "[DirAddKbContent]"
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async addContent(id_project, token, json, caller = "[KbService]") {
    return new Promise((resolve) => {
      const HTTPREQUEST = {
        url: apiEndpoint() + "/" + id_project + "/kb",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        json: json,
        method: "POST"
      }
      winston.debug(caller + " HttpRequest: ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, (err, resbody) => {
          resolve({ err: err, resbody: resbody });
        }
      )
    })
  }

  async addUnansweredQuestion(id_project, data, token) {
    
    return new Promise((resolve, reject) => {
      const http_request = {
        url: apiEndpoint() + "/" + id_project + "/kb/unanswered/",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "POST",
        json: data
      }
      winston.debug("Kb HttpRequest", http_request);

      httpUtils.request(http_request, (err, response) => {
        if (err) {
          reject(err);
        } else {
          resolve(response);
        }
      });
    });
  }

  async addAnsweredQuestion(id_project, data, token) {
    return new Promise((resolve, reject) => {
      const http_request = {
        url: apiEndpoint() + "/" + id_project + "/kb/answered/",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        json: data,
        method: "POST"
      }
      winston.debug("Kb HttpRequest", http_request);
      httpUtils.request(http_request, (err, response) => {
        if (err) {
          reject(err);
        } else {
          resolve(response);
        }
      });
    });
  }
}

const kbService = new KBService();
module.exports = kbService;