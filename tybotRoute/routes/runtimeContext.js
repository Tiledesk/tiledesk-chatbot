/**
 * Runtime state shared between startApp() and the route handlers.
 *
 * Before Phase 6a these were module-level `let` bindings in tybotRoute/index.js
 * that startApp() reassigned and the route handlers read at request time. They
 * are now fields of this single mutable object so the routes can live in their
 * own modules while keeping exactly the same read-at-request-time semantics.
 * The initial values are the ones index.js used to declare.
 */
const runtimeContext = {
  /** @type {import('../TdCache.js').TdCache} */
  tdcache: null,
  API_ENDPOINT: null,
  TILEBOT_ENDPOINT: null,
  staticBots: undefined,
  MAX_STEPS: 1000,
  MAX_EXECUTION_TIME: 1000 * 3600 * 8
};

module.exports = { runtimeContext };
