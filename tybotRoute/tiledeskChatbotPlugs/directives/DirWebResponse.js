const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../models/TiledeskChatbotUtil');
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
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("Incorrect directive (no action provided):", directive);
      callback();
      return;
    }
    this.go(action, () => {
        // return stop true?
        callback();
    });
  }

  async go(action, callback) {
    console.log("Web response...");
    let payload = action.payload;
    let status = action.status;

    let requestAttributes = null;
    if (this.tdcache) {
      requestAttributes = 
      await TiledeskChatbot.allParametersStatic(this.tdcache, this.requestId);
      const filler = new Filler();

      try {
        payload = filler.fill(payload, requestAttributes);
        status = filler.fill(status, requestAttributes);
      }
      catch(e) {
        console.error(e)
      }
      
    }

    let webResponse = {
      status: status,
      payload: payload
    }

    const topic = `/webhooks/${this.requestId}`;
    
    try {
      this.tdcache.publish(topic, JSON.stringify(webResponse));
      console.log("Published webresponse to topic:", topic);
    }
    catch(e) {
      console.error(e)
    }

    callback();
    
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