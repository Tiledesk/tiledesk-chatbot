const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const API_ENDPOINT = process.env.API_ENDPOINT;

class KbService {

  constructor() { }

  async getNamespace(id_project, token, name, id) {
    return new Promise((resolve) => {
      const http_request = {
        url: API_ENDPOINT + "/" + id_project + "/kb/namespace/all",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "GET"
      }
      winston.debug("Kb HttpRequest", http_request);
      
      httpUtils.request(
        http_request, async (err, namespaces) => {
          if (err) {
            winston.error("Error getting namespaces:", err);
            reject(err);
          } else {
            winston.debug("Get namespaces response:", namespaces);
            if (!Array.isArray(namespaces)) {
              reject(new Error('Invalid response format'));
              return;
            }
            
            let namespace;
            if (name) {
              namespace = namespaces.find(n => n.name === name);
            } else {
              namespace = namespaces.find(n => n.id === id);
            }
            resolve(namespace || null);
          }
        }
      )
    })
  }

  async getKeyFromKbSettings(id_project, token) {

    return new Promise((resolve, reject) => {
      const http_request = {
        url: API_ENDPOINT + "/" + id_project + "/kbsettings",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "GET"
      }
      winston.debug("Kb HttpRequest", http_request);

      httpUtils.request(
        http_request, async (err, resbody) => {
          if (err) {
            winston.error("Error getting kb settings:", err);
            reject(err);
          } else {
            if (!resbody || !resbody.gptkey) {
              resolve(null);
            } else {
              resolve(resbody.gptkey);
            }
          }
        }
      )
    })
  }

  async addUnansweredQuestion(id_project, namespace, question, token) {
    
    const json = { namespace, question };
    
    return new Promise((resolve, reject) => {
      const http_request = {
        url: API_ENDPOINT + "/" + id_project + "/kb/unanswered/",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "POST",
        json: json
      }
      winston.debug("Kb HttpRequest", http_request);

      httpUtils.request(http_request, (err, response) => {
        if (err) {
          winston.error("Error adding unanswered question:", err);
          reject(err);
        } else {
          resolve(response);
        }
      });
    });
  }
}

const kbService = new KbService();
module.exports = kbService;