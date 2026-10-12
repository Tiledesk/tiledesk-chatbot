const httpUtils = require("../utils/HttpUtils");
const HttpUtils = httpUtils.constructor;
const winston = require("../utils/winston");
const API_ENDPOINT = process.env.API_ENDPOINT;

class RequestService {

  constructor() { }

  replaceBot(id_project, request_id, data, token) {
    const url = API_ENDPOINT + "/" + id_project + "/requests/" + request_id + "/replace";
    const httpRequest = {
      url: url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'JWT ' + token
      },
      json: data,
      method: 'PUT'
    };

    winston.info("(RequestService) replaceBot request " + JSON.stringify({
      url: url,
      requestId: request_id,
      data: data,
      hasToken: !!token
    }));
    const started = Date.now();

    return new Promise((resolve, reject) => {
      httpUtils.request(httpRequest, (err, resbody) => {
        const duration_ms = Date.now() - started;
        if (err) {
          winston.error("(RequestService) replaceBot failed " + JSON.stringify({
            requestId: request_id,
            duration_ms: duration_ms,
            ...HttpUtils.errorSummary(err, url)
          }));
          reject(err);
          return;
        }
        winston.info("(RequestService) replaceBot response " + JSON.stringify({
          requestId: request_id,
          duration_ms: duration_ms,
          participants: resbody?.participants,
          replaced_bot_root_id: resbody?.replaced_bot_root_id
        }));
        resolve(resbody);
      });
    });
  }
}

const requestService = new RequestService();
module.exports = requestService;
