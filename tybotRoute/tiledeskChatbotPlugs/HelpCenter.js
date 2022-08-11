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




    
            /*request({
                url: url,
                method: 'GET'
            }, (err, resp, resbody) => {
                if (err) {
                    console.log("ERROR search content request: ", err)
                } else {
                    console.log("request resbody: ", resbody);

                    if (resp.statusCode === 200) {
                        JSON.parse(resbody).forEach(content => {

                            if (content.url.charAt(content.url.length -1) != "/") {
                                content.url = content.url + "/"
                            }
                            var button = { type: "url", value: content.title, link: content.url, target: "self" };
                            attributes.attachment.buttons.push(button);
                        })

                        console.log("Attributes: ", JSON.stringify(attributes));

                        var msg = { text: setting.message, sender: sender_id, senderFullname: senderFullname, attributes: attributes };
                        console.log("msg: ", msg);
                        console.log("buttons: ", msg.attributes.attachment.buttons)
                        
                        const tdClient = new TiledeskClient({
                            projectId: projectId,
                            token: token,
                            APIKEY: '__APIKEY__'
                        })

                        if (attributes.attachment.buttons.length > 0) {
                            tdClient.sendSupportMessage(recipient_id, msg);
                        }
                        return res.status(200).send({ message: 'ok' });
                    }

                }
            })*/
    
  }

  /*sendSupportMessage(requestId, message, APIURL, projectId, jwt_token, callback) {
  // const jwt_token = TiledeskClient.fixToken(this.token);
  const url = `${APIURL}/${projectId}/requests/${requestId}/messages`;
  const HTTPREQUEST = {
    url: url,
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': "JWT " + jwt_token
    },
    json: message,
    method: 'POST'
  };
  myrequest(
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
}*/

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