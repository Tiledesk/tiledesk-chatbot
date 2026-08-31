const winston = require('../utils/winston');

/**
 * RequestParameters
 *
 * Request-scoped parameter (flow attributes) store, extracted verbatim from
 * TiledeskChatbot. These functions only depend on a TdCache instance and a
 * requestId: they hold no engine state, so keeping them here lets the
 * directives read/write flow attributes without requiring the engine.
 *
 * Type-only import (erased at runtime, so no require and no cycle):
 * @typedef {import('../types').TdCacheLike} TdCacheLike
 */

/**
 * The root cache key for a request: "tilebot:requests:<requestId>".
 *
 * @param {string} requestId
 * @returns {string}
 */
function requestCacheKey(requestId) {
  const request_key = "tilebot:requests:" + requestId;
  return request_key;
}

/**
 * Writes one flow attribute for a request.
 *
 * No-ops on a null/undefined name, and silently drops values whose JSON form
 * exceeds 20 MB. The hash gets a TTL from FLOW_ATTRIBUTES_TTL (default 15 days).
 *
 * @param {TdCacheLike} _tdcache
 * @param {string} requestId
 * @param {string|null|undefined} parameter_name
 * @param {any} parameter_value  Stored JSON-serialised.
 * @returns {Promise<void>}
 */
async function addParameterStatic(_tdcache, requestId, parameter_name, parameter_value) {
  if (parameter_name === null || parameter_name === undefined) {
    return;
  }
  const parameter_key = requestCacheKey(requestId) + ":parameters";
  const parameter_value_s = JSON.stringify(parameter_value);
  if (parameter_value_s?.length > 20000000) {
    return;
  }
  const ttl = parseInt(process.env.FLOW_ATTRIBUTES_TTL, 10) || (15 * 24 * 60 * 60); // default 15 days
  await _tdcache.hset(parameter_key, parameter_name, parameter_value_s, { EX: ttl });
}

/**
 * Reads every flow attribute for a request, JSON-parsed back to native values.
 * A value that fails to parse is logged and omitted.
 *
 * @param {TdCacheLike} _tdcache
 * @param {string} requestId
 * @returns {Promise<Record<string, any>>}
 */
async function allParametersStatic(_tdcache, requestId) {
  const parameters_key = requestCacheKey(requestId) + ":parameters";
  const attributes__as_string_map = await _tdcache.hgetall(parameters_key);
  /** @type {Record<string, any>} */
  let attributes_native_values = {};
  if (attributes__as_string_map !== null) {
    for (const [key, value] of Object.entries(attributes__as_string_map)) {
      try {
        attributes_native_values[key] = JSON.parse(value);
      }
      catch(err) {
        winston.error("(TiledeskChatbot) An error occurred while JSON.parse(). Parsed value: " + value + " in allParametersStatic(). Error: " + JSON.stringify(err));
      }
    }
  }
  return attributes_native_values;
}

/**
 * Reads one flow attribute, JSON-parsed. Returns the raw string if it is not
 * valid JSON (the parse error is logged, not thrown).
 *
 * @param {TdCacheLike} _tdcache
 * @param {string} requestId
 * @param {string} key
 * @returns {Promise<any>}
 */
async function getParameterStatic(_tdcache, requestId, key) {
  let value = await _tdcache.hget(
    requestCacheKey(requestId) + ":parameters", key);
  try {
    value = JSON.parse(value);
  }
  catch(error) {
    winston.error("(TiledeskChatbot) Error parsing to JSON an Attribute:", error);
  }
  return value;
}

/**
 * Deletes one flow attribute.
 *
 * @param {TdCacheLike} _tdcache
 * @param {string} requestId
 * @param {string} paramName
 * @returns {Promise<void>}
 */
async function deleteParameterStatic(_tdcache, requestId, paramName) {
  return await _tdcache.hdel(
    requestCacheKey(requestId) + ":parameters", paramName);
}

module.exports = {
  requestCacheKey,
  addParameterStatic,
  allParametersStatic,
  getParameterStatic,
  deleteParameterStatic
};
