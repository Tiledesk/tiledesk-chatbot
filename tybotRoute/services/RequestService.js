const httpUtils = require("../utils/HttpUtils");
const winston = require("../utils/winston");
const API_ENDPOINT = process.env.API_ENDPOINT;

class RequestService {

  constructor() { }

  replaceBot(id_project, request_id, data, token) {
    const httpRequest = {
      url: API_ENDPOINT + "/" + id_project + "/requests/" + request_id + "/replace",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'JWT ' + token
      },
      json: data,
      method: 'PUT'
    };

    return new Promise((resolve, reject) => {
      httpUtils.request(httpRequest, (err, resbody) => {
        if (err) {
          winston.error("(RequestService) error: ", err);
          reject(err);
          return;
        }
        resolve(resbody);
      });
    });
  }
}

const requestService = new RequestService();
module.exports = requestService;
