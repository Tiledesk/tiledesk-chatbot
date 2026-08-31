const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const { openaiEndpoint } = require('../config/endpoints');

/**
 * The OpenAI-compatible chat completions endpoint, `OPENAI_ENDPOINT`.
 *
 * One call site (DirGptTask). It is extracted anyway: the point is that the
 * directive's `go()` should read as its flow, not as axios wiring, and the
 * url, the `Bearer` header and the request assembly are exactly the part that
 * was in the way.
 *
 * NOT to be confused with OpenAIAssistantsService, which talks to the
 * hardcoded api.openai.com Assistants v2 api and has nothing in common with
 * this beyond the vendor.
 *
 * Returns the raw `{err, resbody}`: DirGptTask digs `err.response.data.error
 * .message` out of the failure and `resbody.choices[0].message.content` plus
 * `resbody.usage.total_tokens` out of the success, and keeps doing so.
 */
class OpenAIService {

  constructor() { }

  /**
   * The full completions url, resolved at call time. Exposed so the call site
   * can keep logging it where it logged it before.
   * @returns {string} `${OPENAI_ENDPOINT}/chat/completions`
   */
  completionsUrl() {
    return openaiEndpoint() + "/chat/completions";
  }

  /**
   * POST a chat completion.
   *
   * @param {string} key      the api key, sent as "Bearer <key>"
   * @param {object} json     the request body, assembled by the caller
   * @param {string} [caller] log prefix, e.g. "(DirGptTask)"
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async chatCompletions(key, json, caller = "(OpenAIService)") {
    return new Promise((resolve) => {
      const HTTPREQUEST = {
        url: this.completionsUrl(),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
        },
        json: json,
        method: 'POST'
      }
      winston.debug(caller + " HttpRequest: ", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, (err, resbody) => {
          resolve({ err: err, resbody: resbody });
        }
      )
    })
  }

}

const openAIService = new OpenAIService();
module.exports = openAIService;
