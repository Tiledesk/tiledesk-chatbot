const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const API_ENDPOINT = process.env.API_ENDPOINT;

class QuotasService {

  constructor() { }

  async checkQuoteAvailability(id_project, token) {
    return new Promise((resolve) => {

      const http_request = {
        url: API_ENDPOINT + "/" + id_project + "/quotes/tokens",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "GET"
      }
      winston.debug("QuotasService HttpRequest", http_request);

      httpUtils.request(
        http_request, async (err, resbody) => {
          if (err) {
            winston.error("Check quote availability err: ", err);
            resolve(true)
          } else {
            if (resbody.isAvailable === true) {
              resolve(true)
            } else {
              resolve(false)
            }
          }
        }
      )
    })
  }

  async updateQuote(id_project, token, tokens_usage) {
    return new Promise((resolve, reject) => {

      const http_request = {
        url: API_ENDPOINT + "/" + id_project + "/quotes/incr/tokens",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        json: tokens_usage,
        method: "POST"
      }
      winston.debug("DirAskGPTV2 update quote HttpRequest ", http_request);

      httpUtils.request(
        http_request, async (err, resbody) => {
          if (err) {
            winston.error("Increment tokens quote err: ", err);
            reject(false)
          } else {
            resolve(true);
          }
        }
      )
    })
  }

}

const quotasService = new QuotasService();
module.exports = quotasService;