const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../utils/TiledeskChatbotUtil');
const winston = require('../../utils/winston');
let axios = require('axios');

class DirWebResponse {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.projectId = context.projectId;
    this.requestId = context.requestId;
    this.token = context.token;
    this.tdcache = context.tdcache;
  }

  execute(directive, callback) {
    winston.debug("Execute WebResponse directive: ", directive);
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.debug("DirWebResponse Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
        // return stop true?
        callback();
    });
  }

  async go(action, callback) {
    winston.debug("DirWebResponse action: ", action);
    
    if (!this.tdcache) {
      winston.error("DirWebResponse Error: tdcache is mandatory");
      callback();
      return;
    }
    
    let requestAttributes = null;
    requestAttributes = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
        );
    
    const filler = new Filler();
    const filled_status = filler.fill(action.status, requestAttributes);
    const json = await this.getJsonFromAction(action, filler, requestAttributes)

    let webResponse = {
      status: filled_status,
      payload: json
    }

    const topic = `/webhooks/${this.requestId}`;
    
    try {
      this.tdcache.publish(topic, JSON.stringify(webResponse));
      winston.verbose("DirWebResponse Published webresponse to topic: " + topic);
    }
    catch(e) {
      winston.error("DirWebResponse Error: ", e)
    }

    callback();
    
  }

  async getJsonFromAction(action, filler, requestAttributes) {
  
      return new Promise( async (resolve, reject) => {
  
        if (action.payload && action.bodyType == "json") {
          let jsonBody = filler.fill(action.payload, requestAttributes);
          try {
            let json = JSON.parse(jsonBody);
            resolve(json);
          }
          catch (err) {
            winston.error("Error parsing webRequest jsonBody: " + JSON.stringify(jsonBody) + "\nError: " + JSON.stringify(err));
            reject("Error parsing jsonBody");
          }
        }
        else {
          resolve(null);
        }
      })
  }

}



/**
 * A stub to send message to the "ext/botId" endpoint, hosted by tilebot on:
 * /${TILEBOT_ROUTE}/ext/${botId}
 *
 * @param {Object} webResponse. The webhook response to send back
 * @param {Object} projectId. The projectId
 * @param {string} botId. Tiledesk botId
 * @param {string} token. User token
 */
// function sendResponse(webResponse, projectId, botId, callback) {
//   const url = `${WEBHOOK_URL}/${projectId}/${botId}`;
//   const HTTPREQUEST = {
//     url: url,
//     headers: {
//       'Content-Type': 'application/json'
//     },
//     json: webResponse,
//     method: 'POST'
//   };
//   myrequest(
//     HTTPREQUEST,
//     function (err, resbody) {
//       if (err) {
//         if (callback) {
//           callback(err);
//         }
//       }
//       else {
//         if (callback) {
//           callback(null, resbody);
//         }
//       }
//     }, false
//   );
// }

module.exports = { DirWebResponse };