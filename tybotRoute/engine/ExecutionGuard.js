const winston = require('../utils/winston');
const RequestParameters = require('./RequestParameters');

/**
 * ExecutionGuard
 *
 * Per-request execution accounting, extracted verbatim from TiledeskChatbot:
 * the step counter and the wall-clock guard that stop a runaway flow, plus the
 * resets used when a conversation restarts. Like RequestParameters these
 * functions depend only on a TdCache instance and a requestId - they hold no
 * engine state - so they do not need the engine to be instantiated.
 */

async function checkStep(_tdcache, requestId, max_steps, max_execution_time) {
  winston.verbose("(TiledeskChatbot) Checking on MAX_STEPS: " + max_steps);
  // let go_on = true; // continue
  const parameter_key = RequestParameters.requestCacheKey(requestId) + ":step";
  winston.verbose("(TiledeskChatbot) __parameter_key:", parameter_key);
  await _tdcache.incr(parameter_key);
  let _current_step = await _tdcache.get(parameter_key);
  let current_step = Number(_current_step);
  if (current_step > max_steps) {
    winston.verbose("(TiledeskChatbot) max_steps limit just violated");
    winston.verbose("(TiledeskChatbot) Current Step > Max Steps: " + current_step);
    return {
      error: "Anomaly detection. MAX ACTIONS (" + max_steps + ") exeeded.",
      error_code: 'max_steps_exceeded',
      step_count: current_step
    };
  }
  // else {
  //   go_on = true;
  // }

  // check execution_time
  // const TOTAL_ALLOWED_EXECUTION_TIME = 1000 * 60 // * 60 * 12 // 12 hours
  let start_time_key = RequestParameters.requestCacheKey(requestId) + ":started";
  let start_time = await _tdcache.get(start_time_key);
  const now = Date.now();
  if (start_time === null || Number(start_time) === 0) {
    await _tdcache.set(start_time_key, now);
    return {};
  }
  else {
    const execution_time = now - Number(start_time);
    if (execution_time > max_execution_time) {
      winston.verbose("(TiledeskChatbot) execution_time > TOTAL_ALLOWED_EXECUTION_TIME. Stopping flow");
      return {
        error: "Anomaly detection. MAX EXECUTION TIME (" + max_execution_time + " ms) exeeded.",
        error_code: 'max_time_exceeded',
        step_count: current_step
      };
    }
  }
  return {};
}

async function resetStep(_tdcache, requestId) {
  const parameter_key = RequestParameters.requestCacheKey(requestId) + ":step";
  if (_tdcache) {
    await _tdcache.set(parameter_key, 0);
  }
}

async function resetStarted(_tdcache, requestId) {
  const parameter_key = RequestParameters.requestCacheKey(requestId) + ":started";
  if (_tdcache) {
    await _tdcache.set(parameter_key, 0);
  }
}

async function currentStep(_tdcache, requestId) {
  const parameter_key = RequestParameters.requestCacheKey(requestId) + ":step";
  return await _tdcache.get(parameter_key);
}

module.exports = {
  checkStep,
  resetStep,
  resetStarted,
  currentStep
};
