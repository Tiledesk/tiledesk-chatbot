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

module.exports = {
  apiEndpoint,
  tilebotEndpoint
};
