'use strict';

/**
 * Central resolution of the endpoint configuration.
 *
 * There used to be TWO sources of truth for the same urls:
 *
 *   - this module, which read `process.env` lazily, and is what every service
 *     under tybotRoute/services/ resolves through;
 *   - `startApp()`, which stored `settings.API_ENDPOINT` /
 *     `settings.TILEBOT_ENDPOINT` on `runtimeContext`, which is what reaches
 *     each directive as `context.API_ENDPOINT`.
 *
 * They agreed only by accident, because the root index.js happens to pass
 * `process.env.API_ENDPOINT` straight through to `startApp`. `startApp`'s
 * contract accepts ANY settings object, so an embedder that configured an
 * endpoint without also exporting the environment variable got a runtimeContext
 * pointing one way and the services pointing another - a divergence that grew
 * from 1 endpoint to 10 as services were extracted.
 *
 * `configure()` closes that gap: `startApp` seeds this module from its
 * `settings`, and everything - services AND runtimeContext - now resolves here.
 * A configured value wins; when nothing was configured for a key we fall back
 * to `process.env`, exactly as before.
 *
 * Resolution stays LAZY. Every accessor reads at CALL time, never at
 * module-load time. Services used to bind their endpoint with a top-level
 * `const API_ENDPOINT = process.env.API_ENDPOINT;`, which froze the value at
 * the moment the module was first required. Any consumer that set (or changed)
 * the variable after that first require silently kept talking to the old
 * endpoint - the reason the test suite has to spawn one process per file.
 */

/**
 * The settings keys this module resolves. A key absent from `configure()`'s
 * argument is NOT remembered, so it keeps falling back to `process.env`.
 */
const ENDPOINT_KEYS = [
  'API_ENDPOINT',
  'TILEBOT_ENDPOINT',
  'KB_ENDPOINT',
  'KB_ENDPOINT_QA',
  'KB_ENDPOINT_QA_GPU',
  'OPENAI_ENDPOINT',
  'WHATSAPP_ENDPOINT',
  'BREVO_ENDPOINT',
  'CUSTOMERIO_ENDPOINT',
  'HUBSPOT_ENDPOINT',
  'MAKE_ENDPOINT',
  'QAPLA_ENDPOINT'
];

/** Values seeded by `configure()`. Empty until startApp runs. */
let configured = {};

/**
 * Seed the endpoint configuration from an application settings object.
 *
 * Called once by `startApp(settings)`. Only the keys listed in
 * `ENDPOINT_KEYS` are read, and only when their value is neither `undefined`
 * nor `null` - so the very common `{ TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT }`
 * with an unset variable counts as "not configured" and keeps the previous
 * env-based behaviour.
 *
 * The previous configuration is REPLACED, not merged, so a second call fully
 * describes the state (a re-`startApp` cannot leak a stale endpoint).
 *
 * @param {object} [settings] the startApp settings object.
 */
function configure(settings) {
  const next = {};
  if (settings) {
    for (const key of ENDPOINT_KEYS) {
      const value = settings[key];
      if (value !== undefined && value !== null) {
        next[key] = value;
      }
    }
  }
  configured = next;
}

/**
 * Configured value first, `process.env` second. Read at call time.
 * @param {string} key
 * @returns {string|undefined}
 */
function resolve(key) {
  if (configured[key] !== undefined) {
    return configured[key];
  }
  return process.env[key];
}

/**
 * The Tiledesk server API base url.
 * @returns {string|undefined} settings.API_ENDPOINT, else process.env.API_ENDPOINT, as-is.
 */
function apiEndpoint() {
  return resolve('API_ENDPOINT');
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
  return resolve('TILEBOT_ENDPOINT') || `${apiEndpoint()}/modules/tilebot`;
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
    return resolve('KB_ENDPOINT_QA_GPU');
  }
  return resolve('KB_ENDPOINT_QA');
}

/**
 * The legacy knowledge-base base url used by DirAskGPT (the v1 /qa route).
 * @returns {string|undefined} settings.KB_ENDPOINT, else process.env.KB_ENDPOINT, as-is.
 */
function kbEndpoint() {
  return resolve('KB_ENDPOINT');
}

/**
 * The OpenAI-compatible completion service base url used by DirGptTask.
 * @returns {string|undefined} settings.OPENAI_ENDPOINT, else process.env.OPENAI_ENDPOINT, as-is.
 */
function openaiEndpoint() {
  return resolve('OPENAI_ENDPOINT');
}

/**
 * The Whatsapp module base url.
 *
 * DirSendWhatsapp and DirWhatsappByAttribute both carried the same fallback:
 *
 *   const pre = process.env.WHATSAPP_ENDPOINT;
 *   if (pre) { url = pre; } else { url = API_ENDPOINT + "/modules/whatsapp/api"; }
 *
 * Reproduced exactly, so an unset OR empty WHATSAPP_ENDPOINT still derives the
 * url from the API endpoint, and an unset API_ENDPOINT still yields the literal
 * "undefined/modules/whatsapp/api".
 * @returns {string}
 */
function whatsappEndpoint() {
  const whatsapp_api_url_pre = resolve('WHATSAPP_ENDPOINT');
  if (whatsapp_api_url_pre) {
    return whatsapp_api_url_pre;
  }
  return apiEndpoint() + "/modules/whatsapp/api";
}

/* ------------------------------------------------------------------ vendors
 *
 * The five external systems below were each resolved inline in their own
 * directive, as `process.env.X_ENDPOINT || "<the vendor's production url>"`.
 * The variables exist so a test can point a directive at a local stub; the
 * literal default is the real service. Both halves are reproduced verbatim.
 */

/**
 * Brevo (ex Sendinblue) API base url. Used by BrevoService.
 * @returns {string}
 */
function brevoEndpoint() {
  return resolve('BREVO_ENDPOINT') || "https://api.brevo.com/v3";
}

/**
 * Customer.io track API base url. Used by CustomerioService.
 * @returns {string}
 */
function customerioEndpoint() {
  return resolve('CUSTOMERIO_ENDPOINT') || "https://track.customer.io/api/v1";
}

/**
 * Hubspot CRM API base url. Note the TRAILING SLASH in the default: the call
 * site appends "objects/contacts/batch/create" with no separator of its own,
 * so the slash is load bearing and is kept exactly as it was.
 * @returns {string}
 */
function hubspotEndpoint() {
  return resolve('HUBSPOT_ENDPOINT') || "https://api.hubapi.com/crm/v3/";
}

/**
 * Qapla shipment API base url. Used by QaplaService.
 * @returns {string}
 */
function qaplaEndpoint() {
  return resolve('QAPLA_ENDPOINT') || "https://api.qapla.it/1.2";
}

/**
 * The Make override base url, and the ONLY endpoint here with no default.
 *
 * DirMake posts to a webhook url supplied by the bot author, EXCEPT when
 * MAKE_ENDPOINT is set, in which case the author's url is ignored entirely and
 * the request goes to `${MAKE_ENDPOINT}/make/`. The original comment is worth
 * repeating: this variable is for testing only and must not be defined in a
 * production environment.
 *
 * @returns {string|undefined} undefined when no override is configured.
 */
function makeEndpoint() {
  return resolve('MAKE_ENDPOINT');
}

module.exports = {
  configure,
  apiEndpoint,
  tilebotEndpoint,
  qaEndpoint,
  kbEndpoint,
  openaiEndpoint,
  whatsappEndpoint,
  brevoEndpoint,
  customerioEndpoint,
  hubspotEndpoint,
  qaplaEndpoint,
  makeEndpoint
};
