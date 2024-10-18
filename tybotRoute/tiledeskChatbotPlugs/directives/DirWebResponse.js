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
      callback();
    });
  }

  async go(action, callback) {
    const payload = action.payload;
    const status = action.status;

    // fill
    let requestAttributes = null;
    if (this.tdcache) {
      requestAttributes = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );
      // if (this.log) {
      //   for (const [key, value] of Object.entries(requestAttributes)) {
      //     const value_type = typeof value;
      //     if (this.log) {console.log("(DirWebResponse) request parameter:", key, "value:", value, "type:", value_type)}
      //   }
      // }
      const filler = new Filler();
      // fill text attribute
      payload = filler.fill(payload, requestAttributes);
      status = filler.fill(status, requestAttributes);
    }

    let webResponse = {
      status: status,
      payload: payload
    }
    this.context.tdcache.publish("webhooks/" + this.chatbot.getParameter("webhook_id"),webResponse );
    // this.context.tdclient.sendResponse(
    //   webResponse,
    //   this.projectId,
    //   this.requestId,
    //   (err) => {
    //     if (err) {
    //       console.error("Error sending reply:", err);
    //     }
    //     if (this.log) {console.log("Web respose sent", webResponse);}
    //     callback();
    // });
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

// function myrequest(options, callback, log) {
//   if (log) {
//     console.log("API URL:", options.url);
//     console.log("** Options:", JSON.stringify(options));
//   }
//   axios(
//     {
//       url: options.url,
//       method: options.method,
//       data: options.json,
//       params: options.params,
//       headers: options.headers
//     })
//     .then((res) => {
//       if (log) {
//         console.log("Response for url:", options.url);
//         console.log("Response headers:\n", JSON.stringify(res.headers));
//         //console.log("******** Response for url:", res);
//       }
//       if (res && res.status == 200 && res.data) {
//         if (callback) {
//           callback(null, res.data);
//         }
//       }
//       else {
//         if (callback) {
//           callback(TiledeskClient.getErr({ message: "Response status not 200" }, options, res), null, null);
//         }
//       }
//     })
//     .catch((error) => {
//       // console.error("An error occurred:", error);
//       if (callback) {
//         callback(error, null, null);
//       }
//     });
// }

module.exports = { DirWebResponse };