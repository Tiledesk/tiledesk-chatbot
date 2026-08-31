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

  async getNamespace(id_project, token, name, id) {
    return new Promise((resolve) => {
      const http_request = {
        url: apiEndpoint() + "/" + id_project + "/kb/namespace/all",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "GET"
      }
      winston.debug("Kb HttpRequest", http_request);
      
      httpUtils.request(
        http_request, async (err, namespaces) => {
          if (err) {
            winston.error("Error getting namespaces:", err);
            reject(err);
          } else {
            winston.debug("Get namespaces response:", namespaces);
            if (!Array.isArray(namespaces)) {
              reject(new Error('Invalid response format'));
              return;
            }
            
            let namespace;
            if (name) {
              namespace = namespaces.find(n => n.name === name);
            } else {
              namespace = namespaces.find(n => n.id === id);
            }
            resolve(namespace || null);
          }
        }
      )
    })
  }

  /**
   * Look a namespace up by name OR by id, resolving `null` when the lookup
   * fails and `undefined` when it succeeds but nothing matches.
   *
   * DirAddKbContent and DirAskGPTV2 each carried a byte-identical private
   * `getNamespace(name, id)`; the ONLY difference was the winston prefix,
   * which `caller` reproduces. It is deliberately NOT merged with
   * `getNamespace` above: that one rejects on error (with an undeclared
   * `reject`, see its own note), returns `namespace || null`, and validates
   * that the body is an array. The directives' copy does none of that, and
   * both call sites test the result with a bare `if (!ns)`, so the
   * undefined-vs-null distinction is invisible to them but is preserved here
   * anyway rather than "tidied".
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