const winston = require('../utils/winston.js');
let axios = require('axios');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');

/**
 * DEAD CODE, moved verbatim out of tybotRoute/index.js (Phase 6a).
 *
 * Neither of these was called from anywhere: checkRequest() has never been
 * implemented (it is an empty stub with a TODO) and myrequest() lost its last
 * caller at some point. They are preserved as-is rather than deleted, because
 * this phase is a pure structural move.
 */

async function checkRequest(request_id, id_project) {
  // TO DO CHECK

  // if (request_id startsWith "support-request-{$project_id}")
  //    if (project_id is equal to the id_project)
  //        return true;
  //    else 
  //        return (false, motivation)
  // else if (request_id startsWith "automation-request-{$project_id}")
  //    if (project_id is equal to the id_project)
  //        return true;
  //    else 
  //        return (false, motivation)
  // else
  //    return (false, motivation);
  
  // WARNING! Move this function in models/TiledeskChatbotUtil.js
}

function myrequest(options, callback) {
  winston.verbose("(tybotRoute) myrequest API URL:" + options.url);
  winston.debug("(tybotRoute) myrequest Options:", options);

  axios(
    {
      url: options.url,
      method: options.method,
      data: options.json,
      params: options.params,
      headers: options.headers
    })
    .then((res) => {
      winston.verbose("Response for url:" + options.url);
      winston.debug("Response headers:\n", res.headers);
      if (res && res.status == 200 && res.data) {
        if (callback) {
          callback(null, res.data);
        }
      }
      else {
        if (callback) {
          callback(TiledeskClient.getErr({ message: "Response status not 200" }, options, res), null, null);
        }
      }
    }).catch((error) => {
      winston.error("(tybotRoute index) An error occurred: ", error);
      if (callback) {
        callback(error, null, null);
      }
    }
  );
}

module.exports = { checkRequest, myrequest };
