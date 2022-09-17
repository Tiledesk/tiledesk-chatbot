let axios = require('axios');
let https = require("https");

class HelpCenter {
  
  constructor(options) {
    this.SERVER_URL = options.SERVER_URL; // https://tiledesk-cms-server-prod.herokuapp.com
    this.projectId = options.projectId;
    this.workspace_id = options.workspace_id;
    this.log = options.log
  }

  search(text, maxResults, callback) {

    const escaped_text = encodeURI(text);
    var url = this.SERVER_URL + `/${this.projectId}/${this.workspace_id}/contents/search?text=${escaped_text}&maxresults=${maxResults}`

    const HTTPREQUEST = {
      url: url,
      headers: {
      },
      method: 'GET'
    };
    this.myrequest(
      HTTPREQUEST,
      function(err, resbody) {
        if (err) {
          if (callback) {
            callback(err);
          }
        }
        else {
          if (callback) {
            callback(null, resbody);
          }
        }
      }, this.log
    );
  }

  myrequest(options, callback, log) {
    //console.log("API URL:", options.url);
    //console.log("** Options:", options);
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });
    axios(
      {
        url: options.url,
        method: options.method,
        data: options.json,
        httpsAgent: httpsAgent,
        headers: options.headers
      })
    .then(function (res) {
      if (log) {
        console.log("Response for url:", options.url);
        console.log("Response headers:\n", res.headers);
        console.log("******** Response for url:", res);
        console.log("Response body:\n", res.data);
      }
      if (res && res.status == 200 && res.data) {
        if (callback) {
          callback(null, res.data);
        }
      }
      else {
        if (callback) {
          callback(TiledeskClient.getErr({message: "Response status not 200"}, options, res), null, null);
        }
      }
    })
    .catch(function (error) {
      console.error("An error occurred:", error);
      if (callback) {
        callback(error, null, null);
      }
    });
  }
}

module.exports = { HelpCenter };