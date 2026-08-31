const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const { apiEndpoint } = require('../config/endpoints');

/**
 * Every remote call the directives make against the Tiledesk platform API.
 *
 * Two families live here, and they are deliberately kept apart:
 *
 *  1. Calls the directives built by hand with `httpUtils.request`
 *     (`replaceBot`, `addTag`, `updateRequestTags`, `updateLeadTags`,
 *     `availableAgents`, `isOpen`). These resolve `{ err, resbody }` and
 *     NEVER reject: `httpUtils.request` reports failure on its callback, and
 *     the value is handed back untouched so each call site keeps its own -
 *     different - error/status branching verbatim.
 *
 *  2. Calls that go through the `@tiledesk/tiledesk-client` stub
 *     (`getRequestById`, `updateLead`, `openNow`, `sendSupportMessage`).
 *     Those are a pure MOVE: the service builds the client with exactly the
 *     options the directive used to build it with, forwards the same
 *     arguments, and returns whatever the client returns. In particular the
 *     client's own promise semantics - `updateLead` rejecting on error,
 *     `sendSupportMessage` leaving its promise dangling when a callback is
 *     supplied, `getRequestById` resolving `null` on a 404 - are passed
 *     straight through rather than normalised, because the call sites depend
 *     on them (and, in one case, on an existing bug: see `updateLead`).
 *
 * Endpoints resolve at CALL time via config/endpoints.js, never at module
 * load - see the note in that file.
 */
class TiledeskApiService {

  constructor() { }

  /**
   * The TiledeskClient the directives used to build in their own constructors.
   *
   * Six directives carried an identical copy of
   *   new TiledeskClient({ projectId, token, APIURL: this.API_ENDPOINT, APIKEY: "___" })
   * and DirReply's copy additionally passed `log: this.log` (which is always
   * undefined in the current context, and which the client treats exactly like
   * an absent key: `this.log = false; if (options.log) ...`).
   *
   * @param {string} id_project
   * @param {string} token
   * @param {*} [log]
   * @returns {TiledeskClient}
   */
  _client(id_project, token, log) {
    return new TiledeskClient({
      projectId: id_project,
      token: token,
      APIURL: apiEndpoint(),
      APIKEY: "___",
      log: log
    });
  }

  // ---------------------------------------------------------------------------
  // Hand-built requests ({ err, resbody }, never rejects)
  // ---------------------------------------------------------------------------

  /**
   * Replace the bot serving a request.
   *
   *   PUT /{projectId}/requests/{requestId}/replace
   *
   * DirReplaceBotV2 and DirReplaceBotV3 built this request inline and the two
   * copies were identical in url, method, headers and in handing `data`
   * straight to `json`. Only the body they compute differs (V2 sends { name }
   * or { slug }, V3 sends { id } or { slug }) and so does everything they do
   * with the response.
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

  /**
   * Add a tag to the project-wide tag list.
   *
   *   POST /{projectId}/tags
   *
   * The body is passed in whole: the `{ tag, color }` pair - including the
   * hardcoded '#f0806f' - is DirAddTags' own choice, not this endpoint's.
   *
   * @param {string} id_project
   * @param {string} token          raw JWT (sent as "JWT <token>")
   * @param {object} data           body, sent as-is
   * @param {string} [caller]       log prefix
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async addTag(id_project, token, data, caller = "(TiledeskApiService)") {
    return new Promise((resolve) => {

      const HTTPREQUEST = {
        url: apiEndpoint() + "/" + id_project + "/tags",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "POST",
        json: data
      }
      winston.debug(caller + " addTag HttpRequest: ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, (err, resbody) => {
          resolve({ err: err, resbody: resbody });
        }
      )
    })
  }

  /**
   * Set the tags on a request (conversation).
   *
   *   PUT /{projectId}/requests/{requestId}/tag
   *
   * @param {string} id_project
   * @param {string} request_id
   * @param {string} token          raw JWT (sent as "JWT <token>")
   * @param {Array<object>} tags    body, sent as-is (array of { tag, color })
   * @param {string} [caller]       log prefix
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async updateRequestTags(id_project, request_id, token, tags, caller = "(TiledeskApiService)") {
    return new Promise((resolve) => {

      const HTTPREQUEST = {
        url: apiEndpoint() + "/" + id_project + "/requests/" + request_id + '/tag',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "PUT",
        json: tags
      }
      winston.debug(caller + " updateRequestTags HttpRequest: ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, (err, resbody) => {
          resolve({ err: err, resbody: resbody });
        }
      )
    })
  }

  /**
   * Set the tags on a lead.
   *
   *   PUT /{projectId}/leads/{leadId}/tag
   *
   * Note the body shape differs from `updateRequestTags`: DirAddTags sends the
   * plain string array here and the `{ tag, color }` array there. That
   * asymmetry is the call site's, and is preserved by passing the body in.
   *
   * @param {string} id_project
   * @param {string} lead_id
   * @param {string} token          raw JWT (sent as "JWT <token>")
   * @param {*} tags                body, sent as-is
   * @param {string} [caller]       log prefix
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async updateLeadTags(id_project, lead_id, token, tags, caller = "(TiledeskApiService)") {
    return new Promise((resolve) => {

      const HTTPREQUEST = {
        url: apiEndpoint() + "/" + id_project + "/leads/" + lead_id + '/tag',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "PUT",
        json: tags
      }
      winston.debug(caller + " updateLeadTags HttpRequest: ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, (err, resbody) => {
          resolve({ err: err, resbody: resbody });
        }
      )
    })
  }

  /**
   * The agents currently available, project-wide or in one department.
   *
   *   GET /projects/{projectId}/users/availables?raw={raw}[&department={id}]
   *
   * The Authorization header is the only one in this service that tolerates an
   * already-prefixed token: DirIfOnlineAgentsV2 ran it through its own
   * `fixToken`, reproduced here by `httpUtils.fixToken` (same implementation).
   *
   * @param {string} id_project
   * @param {string} token
   * @param {string} [departmentId] appended as `&department=` when truthy
   * @param {*} raw                 interpolated into `?raw=` as-is
   * @param {string} [caller]       log prefix
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async availableAgents(id_project, token, departmentId, raw, caller = "(TiledeskApiService)") {
    return new Promise((resolve) => {

      let URL = `${apiEndpoint()}/projects/${id_project}/users/availables?raw=${raw}`
      if (departmentId) {
        URL = URL + `&department=${departmentId}`
      }
      const HTTPREQUEST = {
        url: URL,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': httpUtils.fixToken(token)
        },
        // json: true,
        method: 'GET',
      };
      winston.debug(caller + " availableAgents HttpRequest: ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, (err, resbody) => {
          resolve({ err: err, resbody: resbody });
        }
      )
    })
  }

  /**
   * Whether the project (or one of its time slots) is inside operating hours.
   *
   *   GET /projects/{projectId}/isopen[?timeSlot={slotId}]
   *
   * Not to be confused with `openNow` below, which is the tiledesk-client's
   * own unauthenticated call to the same path - DirIfOpenHours and
   * DirIfOnlineAgentsV2 reach this endpoint by two different routes, and both
   * are kept as they were.
   *
   * @param {string} id_project
   * @param {string} token          raw JWT (sent as "JWT <token>")
   * @param {string} [slot_id]      appended as `?timeSlot=` when truthy
   * @param {string} [caller]       log prefix
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async isOpen(id_project, token, slot_id, caller = "(TiledeskApiService)") {
    return new Promise((resolve) => {

      let isopen_url = apiEndpoint() + "/projects/" + id_project + "/isopen";
      if (slot_id) {
        isopen_url = isopen_url.concat("?timeSlot=" + slot_id);
      }
      const HTTPREQUEST = {
        url: isopen_url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: 'GET'
      }
      winston.debug(caller + " HttpRequest ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, (err, resbody) => {
          resolve({ err: err, resbody: resbody });
        }
      )
    })
  }

  // ---------------------------------------------------------------------------
  // tiledesk-client calls (returned verbatim, client semantics preserved)
  // ---------------------------------------------------------------------------

  /**
   * Fetch a request by id. DirAddTags awaits this for `request.lead._id`.
   *
   * Returns the client's own promise: it RESOLVES `null` on a 404 and REJECTS
   * on any other error. DirAddTags awaits it without a try/catch, so a non-404
   * failure still escapes as an unhandled rejection exactly as before.
   *
   * @param {string} id_project
   * @param {string} request_id
   * @param {string} token
   * @returns {Promise<*>}
   */
  getRequestById(id_project, request_id, token) {
    return this._client(id_project, token).getRequestById(request_id);
  }

  /**
   * Update a lead's native attributes.
   *
   * PRESERVED BUG: the client's promise rejects on failure and DirContactUpdate
   * never attaches a rejection handler, so an API error surfaces as an
   * unhandled rejection and the directive's callback is never invoked. That is
   * the pre-existing behaviour; the promise is returned unchanged so the call
   * site can keep - or fix - it on its own terms.
   *
   * @param {string} id_project
   * @param {string} token
   * @param {string} lead_id
   * @param {object} nativeAttributes
   * @param {*} attributes
   * @param {*} tags
   * @param {function} [callback]
   * @returns {Promise<*>}
   */
  updateLead(id_project, token, lead_id, nativeAttributes, attributes, tags, callback) {
    return this._client(id_project, token).updateLead(lead_id, nativeAttributes, attributes, tags, callback);
  }

  /**
   * The tiledesk-client's operating-hours check (unauthenticated:
   * GET /projects/{projectId}/isopen with no Authorization header).
   *
   * Callback-style, `(err, result)`, exactly as the client defines it.
   *
   * @param {string} id_project
   * @param {string} token
   * @param {function} callback
   * @returns {void}
   */
  openNow(id_project, token, callback) {
    return this._client(id_project, token).openNow(callback);
  }

  /**
   * Post a message into a request's conversation.
   *
   *   POST /{projectId}/requests/{requestId}/messages
   *
   * Every call site passes a callback, so the client reports on the callback
   * and its returned promise never settles - which is why that promise is not
   * awaited here either.
   *
   * @param {string} id_project
   * @param {string} request_id
   * @param {string} token
   * @param {object} message
   * @param {function} callback     `(err)` / `(null, resbody)`
   * @param {*} [log]               forwarded to the client's `log` option
   * @returns {Promise<*>}
   */
  sendSupportMessage(id_project, request_id, token, message, callback, log) {
    return this._client(id_project, token, log).sendSupportMessage(request_id, message, callback);
  }

}

const tiledeskApiService = new TiledeskApiService();
module.exports = tiledeskApiService;
