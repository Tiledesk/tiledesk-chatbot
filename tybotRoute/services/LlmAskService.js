const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const { qaEndpoint, kbEndpoint } = require('../config/endpoints');

/**
 * The LLM "ask" server - the python service that owns retrieval and the actual
 * completion call.
 *
 * FOUR directives posted to it inline, through THREE genuinely different
 * request shapes. They are kept as three methods on purpose; nothing is
 * unified that was not already byte-identical:
 *
 *   1. `askLegacyKb`   - DirAskGPT
 *        POST {KB_ENDPOINT}/qa, NO headers at all (so axios sends its own
 *        defaults - this is not the same as sending `{}`), body carries the
 *        gptkey.
 *   2. `ask`           - DirAiCondition ("/ask") and DirAiPrompt ("/ask" or
 *        "/thinking"). These two were identical: POST {KB_ENDPOINT_QA}{path}
 *        with `{'Content-Type': 'application/json'}` and no authorization -
 *        both directives built that exact `headers` object as a local.
 *   3. `askNamespace`  - DirAskGPTV2
 *        POST {KB_ENDPOINT_QA | KB_ENDPOINT_QA_GPU}/qa, WITH the project JWT.
 *        The endpoint swap keys off the namespace's `hybrid` flag and is
 *        resolved by `endpoints.qaEndpoint(hybrid)`, whose strict `=== true`
 *        test is unchanged.
 *
 * Every method returns the RAW `{err, resbody}` from httpUtils. Nothing is
 * swallowed, normalised or reinterpreted: each directive branches on
 * `resbody.success`, digs into `err.response.data.detail`, counts tokens and
 * picks its next intent exactly as it did when the callback was inline.
 */
class LlmAskService {

  constructor() { }

  /**
   * Base url of the legacy knowledge-base service (DirAskGPT only).
   * Exposed so the call site can keep logging it where it logged it before.
   * @returns {string|undefined}
   */
  legacyKbBaseUrl() {
    return kbEndpoint();
  }

  /**
   * Base url of the ask/qa service.
   * @param {*} [hybrid] the namespace `hybrid` flag; only a literal `true`
   *                     selects the GPU endpoint.
   * @returns {string|undefined}
   */
  qaBaseUrl(hybrid) {
    return qaEndpoint(hybrid);
  }

  /**
   * DirAskGPT's v1 question answering call.
   *
   * Sends NO headers, exactly as before - the key travels in the body as
   * `gptkey`.
   *
   * @param {object} json    the request body, assembled by the caller
   * @param {string} [caller] log prefix, e.g. "(DirAskGPT)"
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async askLegacyKb(json, caller = "(LlmAskService)") {
    return new Promise((resolve) => {
      const HTTPREQUEST = {
        url: this.legacyKbBaseUrl() + "/qa",
        json: json,
        method: "POST"
      }
      winston.debug(caller + " HttpRequest", HTTPREQUEST);

      httpUtils.request(
        HTTPREQUEST, (err, resbody) => {
          resolve({ err: err, resbody: resbody });
        }
      )
    })
  }

  /**
   * The completion call used by DirAiPrompt and DirAiCondition.
   *
   * @param {object} json     the request body, assembled by the caller
   * @param {string} path     "/ask" or, for reasoning, "/thinking"
   * @param {string} [caller] log prefix, e.g. "DirAiPrompt"
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async ask(json, path, caller = "LlmAskService") {
    return new Promise((resolve) => {
      const HTTPREQUEST = {
        url: this.qaBaseUrl() + path,
        headers: {
          'Content-Type': 'application/json'
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

  /**
   * DirAskGPTV2's namespace-scoped RAG call.
   *
   * @param {object} json     the request body, assembled by the caller
   * @param {*} hybrid        the namespace `hybrid` flag, selecting the endpoint
   * @param {string} token    raw JWT (sent as "JWT <token>")
   * @param {string} [caller] log prefix, e.g. "DirAskGPTV2"
   * @returns {Promise<{err: (Error|null), resbody: *}>} never rejects
   */
  async askNamespace(json, hybrid, token, caller = "LlmAskService") {
    return new Promise((resolve) => {
      const HTTPREQUEST = {
        url: this.qaBaseUrl(hybrid) + "/qa",
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

}

const llmAskService = new LlmAskService();
module.exports = llmAskService;
