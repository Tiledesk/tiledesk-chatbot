const winston = require('../utils/winston');

/**
 * RequestParameters
 *
 * Request-scoped parameter (flow attributes) store, extracted verbatim from
 * TiledeskChatbot. These functions only depend on a TdCache instance and a
 * requestId: they hold no engine state, so keeping them here lets the
 * directives read/write flow attributes without requiring the engine.
 */

function requestCacheKey(requestId) {
  const request_key = "tilebot:requests:" + requestId;
  return request_key;
}

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

async function allParametersStatic(_tdcache, requestId) {
  const parameters_key = requestCacheKey(requestId) + ":parameters";
  const attributes__as_string_map = await _tdcache.hgetall(parameters_key);
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
