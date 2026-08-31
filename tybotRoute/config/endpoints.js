'use strict';

/**
 * Central resolution of the endpoint environment variables.
 *
 * Every accessor here reads `process.env` at CALL time, never at module-load
 * time. Services used to bind their endpoint with a top-level
 * `const API_ENDPOINT = process.env.API_ENDPOINT;`, which froze the value at
 * the moment the module was first required. Any consumer that set (or changed)
 * the variable after that first require silently kept talking to the old
 * endpoint - the reason the test suite has to spawn one process per file.
 *
 * Reading lazily is behaviour-preserving for a normal boot, where the
 * environment is fully populated before the first request goes out.
 */

/**
 * The Tiledesk server API base url.
 * @returns {string|undefined} process.env.API_ENDPOINT, as-is.
 */
function apiEndpoint() {
  return process.env.API_ENDPOINT;
}

/**
 * The Tilebot module base url.
 *
 * Preserves the historical fallback exactly: an unset OR empty
 * TILEBOT_ENDPOINT falls back to `${API_ENDPOINT}/modules/tilebot`, and an
 * unset API_ENDPOINT therefore yields the literal "undefined/modules/tilebot"
 * just as it did before.
 * @returns {string}
 */
function tilebotEndpoint() {
  return process.env.TILEBOT_ENDPOINT || `${process.env.API_ENDPOINT}/modules/tilebot`;
}

/**
 * The knowledge-base "ask" service base url (the /qa and /ask routes).
 *
 * Three directives selected this url inline: DirAiPrompt and DirAiCondition
 * always used KB_ENDPOINT_QA, while DirAskGPTV2 swapped to KB_ENDPOINT_QA_GPU
 * for a hybrid namespace with
 *
 *   let kb_endpoint = process.env.KB_ENDPOINT_QA;
 *   if (ns.hybrid === true) { kb_endpoint = process.env.KB_ENDPOINT_QA_GPU; }
 *
 * The strict `=== true` test is reproduced here, so a call with no argument
 * (DirAiPrompt / DirAiCondition) resolves to KB_ENDPOINT_QA exactly as before,
 * and only a literal `true` reaches the GPU endpoint.
 *
 * @param {*} [hybrid] the namespace's `hybrid` flag, passed through as-is.
 * @returns {string|undefined}
 */
function qaEndpoint(hybrid) {
  if (hybrid === true) {
    return process.env.KB_ENDPOINT_QA_GPU;
  }
  return process.env.KB_ENDPOINT_QA;
}

/**
 * The legacy knowledge-base base url used by DirAskGPT (the v1 /qa route).
 * @returns {string|undefined} process.env.KB_ENDPOINT, as-is.
 */
function kbEndpoint() {
  return process.env.KB_ENDPOINT;
}

/**
 * The OpenAI-compatible completion service base url used by DirGptTask.
 * @returns {string|undefined} process.env.OPENAI_ENDPOINT, as-is.
 */
function openaiEndpoint() {
  return process.env.OPENAI_ENDPOINT;
}

module.exports = {
  apiEndpoint,
  tilebotEndpoint,
  qaEndpoint,
  kbEndpoint,
  openaiEndpoint
};
