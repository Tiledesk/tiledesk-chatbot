const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const { apiEndpoint } = require('../config/endpoints');

/**
 * Tiledesk platform request endpoints that more than one directive talks to.
 *
 *   PUT /{projectId}/requests/{requestId}/replace
 *
 * DirReplaceBotV2 and DirReplaceBotV3 built this request inline, and the two
 * copies were identical in url, method, headers and in handing `data` straight
 * to `json`. Only the *body they compute* differs (V2 sends { name } or
 * { slug }, V3 sends { id } or { slug }) and so does everything they do with
 * the response - the analytics `to_agent_id` fallback and the log prefix. Those
 * stay at the call sites; `data` is passed in, and { err, resbody } is passed
 * back untouched, so neither directive's response handling changes at all.
 *
 * NOT moved here, deliberately - each has exactly ONE caller, so extracting it
 * would add indirection without removing duplication (the same reasoning that
 * kept the per-vendor directives inline):
 *
 *   POST /{projectId}/tags                     DirAddTags.addNewTag
 *   PUT  /{projectId}/requests/{id}/tag        DirAddTags.updateRequestWithTags
 *   PUT  /{projectId}/leads/{id}/tag           DirAddTags.updateLeadWithTags
 *
 * Those three share a *shape* with each other (JWT header, resolve-true-on-
 * error), but no two of them are the same call, and no other directive makes
 * any of them.
 */
class TiledeskApiService {

  constructor() { }

  /**
   * Replace the bot serving a request.
   *
   * @param {string} id_project
   * @param {string} request_id
   * @param {string} token          raw JWT (sent as "JWT <token>")
   * @param {object} data           body, sent as-is ({name}|{slug}|{id})
   * @param {string} [caller]       log prefix, e.g. "(DirReplaceBotV3)"
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async replaceBot(id_project, request_id, token, data, caller = "(TiledeskApiService)") {
    return new Promise((resolve) => {

      const HTTPREQUEST = {
        url: apiEndpoint() + "/" + id_project + "/requests/" + request_id + "/replace",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        json: data,
        method: 'PUT'
      }
      winston.debug(caller + " replace HttpRequest: ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, (err, resbody) => {
          resolve({ err: err, resbody: resbody });
        }
      )
    })
  }

}

const tiledeskApiService = new TiledeskApiService();
module.exports = tiledeskApiService;
