const winston = require('../../utils/winston');

/**
 * Factory dei servizi esterni. Coppia mock + real (regola progetto): mock di
 * default (backend non sempre disponibili in dev), real con env `V4_SERVICES_REAL=1`.
 * I test possono passare `opts.services` direttamente (vedi harness).
 */
function createServices(opts) {
  const useReal = process.env.V4_SERVICES_REAL === '1';
  try {
    return useReal
      ? require('./real-services.js').create(opts)
      : require('./mock-services.js').create(opts);
  } catch (err) {
    winston.error('(services) createServices fallback al mock: ', err);
    return require('./mock-services.js').create(opts);
  }
}

module.exports = { createServices };
