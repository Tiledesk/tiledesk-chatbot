const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');

/**
 * The OpenAI Assistants v2 api, as used by DirAssistant.
 *
 * The base url is a LITERAL, not an endpoint setting: DirAssistant has always
 * talked to api.openai.com directly and there is no environment variable for
 * it. Introducing one here would be a behaviour change, so it stays a
 * constant. (This is why it is a separate service from OpenAIService, which
 * owns the configurable `OPENAI_ENDPOINT` completions url.)
 *
 * These five methods are the ONLY part of DirAssistant that was moved. The
 * polling loop (`runThreadOnAssistant`) stays in the directive: it is flow -
 * create a run, wait, re-read its status - and performs no request of its own.
 *
 * ERROR CONVENTION, and why it differs from the other services here.
 * Everywhere else a service resolves `{err, resbody}` so the directive can
 * branch. DirAssistant does not branch per call: it wraps the whole sequence
 * in ONE try/catch and turns any failure into `assignErrorTo` + the false
 * intent. These methods therefore keep the original REJECT semantics exactly,
 * with the raw error - converting them would have meant rewriting `go()`.
 *
 * Two quirks are reproduced verbatim rather than fixed:
 *  - the `if (err) { reject(err) }` has no `return`, so `resolve(...)` is
 *    still called immediately afterwards. It is a no-op on an already
 *    rejected promise, but the ordering is preserved as-is;
 *  - `timeout` is passed in the request object and `utils/HttpUtils` never
 *    forwards it to axios, so it has no effect. It is still passed, so
 *    nothing changes if HttpUtils ever starts honouring it.
 */

/** DirAssistant's hardcoded Assistants api base. Not configurable, as before. */
const OPENAI_API_BASE = "https://api.openai.com/v1";

/** The `OpenAI-Beta` header every one of these calls carried. */
function assistantsHeaders(apikey) {
  return {
    "Authorization": apikey,
    "OpenAI-Beta": "assistants=v2"
  };
}

class OpenAIAssistantsService {

  constructor() { }

  /**
   * POST /threads - create an empty thread.
   *
   * Note the body is the empty STRING `''`, not `{}` or null: that is what the
   * inline code sent ("no old messages on creation") and it is kept as-is.
   *
   * @param {string} apikey    the full Authorization value, e.g. "Bearer sk-..."
   * @param {number} [timeout] carried on the request object; see the class note
   * @param {string} [caller]  log prefix, e.g. "(DirAssistant)"
   * @returns {Promise<object>} the thread; REJECTS with the raw error
   */
  async createThread(apikey, timeout, caller = "(OpenAIAssistantsService)") {
    winston.debug(caller + " creating thread...");
    return new Promise(async (resolve, reject) => {
      const url = OPENAI_API_BASE + "/threads";
      const HTTPREQUEST = {
        url: url,
        headers: assistantsHeaders(apikey),
        json: '', // no old messages on creation
        method: "POST",
        timeout: timeout
      };
      winston.debug(caller + " DirAssistant HttpRequest", HTTPREQUEST);
      httpUtils.request(
        HTTPREQUEST, async (err, res) => {

          if (err) {
            winston.error(caller + " error: ", err);
            reject(err);
          }
          let thread = res;
          winston.debug(caller + " got threadid res: ", res);
          resolve(thread)
        }
      );
    });
  }

  /**
   * POST /threads/{threadId}/messages - append the user's prompt.
   *
   * @param {string} prompt
   * @param {string} threadId
   * @param {string} apikey
   * @param {number} [timeout]
   * @param {string} [caller]
   * @returns {Promise<void>} resolves with NOTHING, as before; REJECTS with the raw error
   */
  async addMessage(prompt, threadId, apikey, timeout, caller = "(OpenAIAssistantsService)") {
    const json_payload = {
      "role": "user",
      "content": prompt
    }

    return new Promise(async (resolve, reject) => {
      const url = `${OPENAI_API_BASE}/threads/${threadId}/messages`;
      const HTTPREQUEST = {
        url: url,
        headers: assistantsHeaders(apikey),
        json: json_payload,
        method: "POST",
        timeout: timeout
      };
      winston.debug(caller + " HttpRequest: ", HTTPREQUEST);
      httpUtils.request(
        HTTPREQUEST, async (err, res) => {

          if (err) {
            winston.error(caller + " error: ", err);
            reject(err);
          }
          winston.debug(caller + " got response data: ", res);
          resolve();
        }
      );
    });
  }

  /**
   * POST /threads/{threadId}/runs - start a run of the assistant.
   *
   * @param {string} threadId
   * @param {string} assistantId
   * @param {string} apikey
   * @param {number} [timeout]
   * @param {string} [caller]
   * @returns {Promise<object>} the run; REJECTS with the raw error
   */
  async createRun(threadId, assistantId, apikey, timeout, caller = "(OpenAIAssistantsService)") {
    const json_payload = {
      "assistant_id": assistantId
    }

    return new Promise(async (resolve, reject) => {
      winston.debug(caller + " adding message to thread...");
      const url = `${OPENAI_API_BASE}/threads/${threadId}/runs`;
      const HTTPREQUEST = {
        url: url,
        headers: assistantsHeaders(apikey),
        json: json_payload,
        method: "POST",
        timeout: timeout
      };
      winston.debug(caller + " HttpRequest: ", HTTPREQUEST);
      httpUtils.request(
        HTTPREQUEST, async (err, res) => {
          if (err) {
            winston.error(caller + " error: ", err);
            reject(err);
          }
          winston.debug("(DirAddTags) got response data: ", res);
          resolve(res);
        }
      );
    });
  }

  /**
   * GET /threads/{threadId}/runs/{runId} - poll a run's status.
   *
   * @param {string} threadId
   * @param {string} runId
   * @param {string} apikey
   * @param {number} [timeout]
   * @param {string} [caller]
   * @returns {Promise<object>} the run; REJECTS with the raw error
   */
  async getRun(threadId, runId, apikey, timeout, caller = "(OpenAIAssistantsService)") {
    return new Promise(async (resolve, reject) => {
      const url = `${OPENAI_API_BASE}/threads/${threadId}/runs/${runId}`;
      const HTTPREQUEST = {
        url: url,
        headers: assistantsHeaders(apikey),
        json: null,
        method: "GET",
        timeout: timeout
      };
      winston.debug(caller + " HttpRequest: ", HTTPREQUEST);
      httpUtils.request(
        HTTPREQUEST, async (err, res) => {
          if (err) {
            winston.error(caller + " error: ", err);
            reject(err);
          }
          winston.debug("(DirAddTags) got response data: ", res);
          resolve(res);
        }
      );
    });
  }

  /**
   * GET /threads/{threadId}/messages - read the thread back.
   *
   * @param {string} threadId
   * @param {string} apikey
   * @param {number} [timeout]
   * @param {string} [caller]
   * @returns {Promise<object>} the message list; REJECTS with the raw error
   */
  async threadMessages(threadId, apikey, timeout, caller = "(OpenAIAssistantsService)") {
    return new Promise(async (resolve, reject) => {
      const url = `${OPENAI_API_BASE}/threads/${threadId}/messages`;
      const HTTPREQUEST = {
        url: url,
        headers: assistantsHeaders(apikey),
        json: null,
        method: "GET",
        timeout: timeout
      };
      winston.debug(caller + " HttpRequest: ", HTTPREQUEST);
      httpUtils.request(
        HTTPREQUEST, async (err, res) => {
          if (err) {
            winston.error(caller + " error: ", err);
            reject(err);
          }
          winston.debug("(DirAddTags) got response data: ", res);
          resolve(res);
        }
      );
    });
  }

}

const openAIAssistantsService = new OpenAIAssistantsService();
module.exports = openAIAssistantsService;
