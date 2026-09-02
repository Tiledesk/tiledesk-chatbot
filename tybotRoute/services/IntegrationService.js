const mongoose = require('mongoose');
const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const Integration = require('../models/integration');
const { apiEndpoint } = require('../config/endpoints');

// Secret fields the API masks (utils/maskIntegrationSecrets.js in tiledesk-server).
const SECRET_KEYS = ['apikey', 'api_key', 'token', 'secret', 'client_secret', 'password'];

/**
 * Integrations hold the credentials a project configured: provider api keys,
 * ollama/vllm tokens, third party keys.
 *
 * GET /:id_project/integration/name/:name masks them (`sk-********2bVU`) since
 * tiledesk-server 2.21.0, so that a credential cannot be read back out of the
 * API. A masked key is still a non-empty string: nothing here would fail, the
 * provider would just answer 401. So the values are read from the database this
 * connector is already connected to, and the API is kept as the fallback for
 * when there is no database (static bots, tests, embedded usage).
 */
class IntegrationService {

  constructor() {
    // Instance fields so tests can substitute stubs.
    this.model = Integration;
    this.httpUtils = httpUtils;
  }

  isConnected() {
    return mongoose.connection.readyState === 1;
  }

  // Same rule as isMaskedSecret in tiledesk-server: masking inserts asterisks.
  looksMasked(value) {
    return typeof value === 'string' && value.includes('*');
  }

  /**
   * The integration document, credentials included, or null when the database
   * cannot answer. Scoped by project: an integration name alone must never be
   * enough to reach another project's credentials.
   */
  async getIntegrationFromDb(id_project, integration_name) {
    if (!id_project || !integration_name) {
      winston.debug("IntegrationService: id_project and integration_name are both required");
      return null;
    }

    if (!this.isConnected()) {
      winston.verbose("IntegrationService: no database connection, falling back to the API");
      return null;
    }

    try {
      const integration = await this.model
        .findOne({ id_project: id_project, name: integration_name })
        .lean()
        .exec();

      if (!integration) {
        winston.verbose("IntegrationService: integration " + integration_name + " not found for project " + id_project);
        return null;
      }

      return integration;
    } catch (err) {
      winston.error("IntegrationService getIntegrationFromDb error: ", err);
      return null;
    }
  }

  async getIntegrationFromApi(id_project, integration_name, token) {
    return new Promise((resolve) => {

      const INTEGRATIONS_HTTPREQUEST = {
        url: apiEndpoint() + "/" + id_project + "/integration/name/" + integration_name,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "GET"
      }
      winston.debug("Integration HttpRequest ", INTEGRATIONS_HTTPREQUEST)

      this.httpUtils.request(
        INTEGRATIONS_HTTPREQUEST, async (err, integration) => {
          if (err) {
            resolve(null);
          } else {
            this.warnIfMasked(integration, id_project, integration_name);
            resolve(integration)
          }
        })
    })
  }

  // The API answer is the fallback, and it carries masked credentials: say so,
  // otherwise the provider's 401 is the only clue left.
  warnIfMasked(integration, id_project, integration_name) {
    const value = integration && integration.value;
    if (!value || typeof value !== 'object') {
      return;
    }

    const masked = SECRET_KEYS.some((key) => this.looksMasked(value[key])) ||
      (Array.isArray(value.servers) && value.servers.some((server) => server && this.looksMasked(server.apikey)));

    if (masked) {
      winston.error("IntegrationService: the API returned a masked credential for integration " +
        integration_name + " of project " + id_project +
        ". The database was not reachable, so the credential cannot be resolved and the provider will reject it.");
    }
  }

  async getIntegration(id_project, integration_name, token) {
    const integration = await this.getIntegrationFromDb(id_project, integration_name);
    if (integration) {
      return integration;
    }

    return await this.getIntegrationFromApi(id_project, integration_name, token);
  }

  async getKeyFromIntegrations(id_project, integration_name, token) {
    const integration = await this.getIntegration(id_project, integration_name, token);

    if (integration && integration.value) {
      return integration.value.apikey;
    }

    return null;
  }

}

const integrationService = new IntegrationService();
module.exports = integrationService;
