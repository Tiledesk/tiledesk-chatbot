const winston = require('../../utils/winston');

/**
 * Factory dei servizi esterni. Coppia mock + real (regola progetto): mock di
 * default (backend non sempre disponibili in dev), real con env `V4_SERVICES_REAL=1`.
 * I test possono passare `opts.services` direttamente (vedi harness).
 */
let _mockWithBackendWarned = false;

function createServices(opts) {
  const useReal = process.env.V4_SERVICES_REAL === '1';
  // Diagnostica: se NON usiamo i real ma un backend è configurato (API_ENDPOINT),
  // le operazioni sulla conversazione (close, transferToAgent, …) saranno NO-OP
  // pur essendo connessi a un server vero — è la causa tipica di "la action close
  // non fa nulla / niente valutazione servizio". Warn una sola volta.
  const hasBackend = !!((opts && opts.apiEndpoint) || process.env.API_ENDPOINT || process.env.API_URL);
  if (!useReal && hasBackend && !_mockWithBackendWarned) {
    _mockWithBackendWarned = true;
    winston.warn(
      '(services) MOCK services attivi MA API_ENDPOINT è configurato: le operazioni ' +
      'sulla conversazione (close, transferToAgent, moveToUnassigned, …) sono NO-OP. ' +
      'Imposta V4_SERVICES_REAL=1 per renderle reali.',
    );
  }
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
