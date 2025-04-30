const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const API_ENDPOINT = process.env.API_ENDPOINT;

class IntegrationService {

  constructor() { }

  async getKeyFromIntegrations(id_project, integration_name, token) {
    return new Promise((resolve) => {

      const INTEGRATIONS_HTTPREQUEST = {
        url: API_ENDPOINT + "/" + id_project + "/integration/name/" + integration_name,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "GET"
      }
      winston.debug("Integration HttpRequest ", INTEGRATIONS_HTTPREQUEST)

      httpUtils.request(
        INTEGRATIONS_HTTPREQUEST, async (err, integration) => {
          if (err) {
            resolve(null);
          } else {

            if (integration &&
              integration.value) {
              resolve(integration.value.apikey)
            }
            else {
              resolve(null)
            }
          }
        })
    })
  }

  async getIntegration(id_project, integration_name, token) {

    return new Promise((resolve) => {

      const INTEGRATIONS_HTTPREQUEST = {
        url: API_ENDPOINT + "/" + id_project + "/integration/name/" + integration_name,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "GET"
      }
      winston.debug("Integration HttpRequest ", INTEGRATIONS_HTTPREQUEST)

      httpUtils.request(
        INTEGRATIONS_HTTPREQUEST, async (err, integration) => {
          if (err) {
            resolve(null);
          } else {
            resolve(integration)
          }
        })
    })
  }

}

const integrationService = new IntegrationService();
module.exports = integrationService;