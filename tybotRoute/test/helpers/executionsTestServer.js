'use strict';

// Defaults when unset, set at load: some modules (RequestService) read API_ENDPOINT once, when
// required, so every executions test file requires this helper first. Put back after the run.
const DEFAULTS = { TILEBOT_ENDPOINT: 'http://localhost:10001', API_ENDPOINT: 'http://localhost:10002' };
const defaulted = Object.keys(DEFAULTS).filter((k) => !process.env[k]);
for (const k of defaulted) process.env[k] = DEFAULTS[k];
if (typeof after === 'function') after(() => { for (const k of defaulted) delete process.env[k]; });

/**
 * Shared by the executions test files, so they all pass in one mocha process:
 * - close() also drops keep-alive sockets (server.closeAllConnections), so after() never hangs
 *   and the port is free for the next file;
 * - suiteEndpoints() is what the rest of the suite expects the engine to point at, with the
 *   suite's usual defaults when API_ENDPOINT / TILEBOT_ENDPOINT are unset.
 */
function listen(server, port) {
  return new Promise((resolve, reject) => {
    const l = server.listen(port, '0.0.0.0', () => resolve(l));
    l.once('error', reject);
  });
}

function close(listener) {
  if (!listener) return Promise.resolve();
  return new Promise((resolve) => {
    listener.close(() => resolve());
    if (typeof listener.closeAllConnections === 'function') listener.closeAllConnections();
  });
}

function suiteEndpoints() {
  return {
    TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT || DEFAULTS.TILEBOT_ENDPOINT,
    API_ENDPOINT: process.env.API_ENDPOINT || DEFAULTS.API_ENDPOINT
  };
}

module.exports = { listen, close, suiteEndpoints };
