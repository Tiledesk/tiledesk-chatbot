const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const { apiEndpoint } = require('../config/endpoints');

/**
 * The project-level knowledge-base settings endpoint.
 *
 *   GET /{projectId}/kbsettings
 *
 * Five directives (DirAddKbContent, DirAiCondition, DirAiPrompt, DirAskGPT,
 * DirGptTask) plus KbService each carried their own byte-identical copy of this
 * request. The six copies agreed on url, method and headers, and on what they
 * extract from the response (`resbody.gptkey`, or null). They differed only in
 * two places, both accommodated here rather than silently dropped:
 *
 *  - the winston prefix: pass `caller` to keep each call site traceable in the
 *    logs exactly as before;
 *  - what they logged out of the error object: three copies logged
 *    `err.message`, three logged `err?.response?.data`. Both are logged here,
 *    so no call site loses information.
 */
class KbSettingsService {

  constructor() { }

  /**
   * Read the project's OpenAI key out of the kb settings.
   *
   * @param {string} id_project
   * @param {string} token       raw JWT (sent as "JWT <token>")
   * @param {string} [caller]    log prefix, e.g. "(DirGptTask)"
   * @returns {Promise<string|null>} the gptkey, or null when the request fails
   *          or the settings carry no key. Never rejects.
   */
  async getKeyFromKbSettings(id_project, token, caller = "(KbSettingsService)") {
    return new Promise((resolve) => {

      const KB_HTTPREQUEST = {
        url: apiEndpoint() + "/" + id_project + "/kbsettings",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "GET"
      }
      winston.debug(caller + " KB HttpRequest", KB_HTTPREQUEST);

      httpUtils.request(
        KB_HTTPREQUEST, async (err, resbody) => {
          if (err) {
            winston.error(caller + " Get kb settings error: " + err?.message, err?.response?.data);
            resolve(null);
          } else {
            // `httpUtils.request` only reaches this branch with a truthy body
            // (a falsy `res.data` is turned into an error), so the historical
            // `!resbody.gptkey` and KbService's `!resbody || !resbody.gptkey`
            // are the same test. Keep the defensive form.
            if (!resbody || !resbody.gptkey) {
              resolve(null);
            } else {
              resolve(resbody.gptkey);
            }
          }
        }
      )
    })
  }

}

const kbSettingsService = new KbSettingsService();
module.exports = kbSettingsService;
