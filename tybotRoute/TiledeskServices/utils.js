let axios = require('axios');
let https = require("https");
const winston = require('../utils/winston');

class Utils {
    constructor(){}


    static myrequest(options, callback, log) {
        winston.verbose("** API URL: " + options.url);
        winston.debug("** Options: ", options);
        let axios_settings = {
          url: options.url,
          method: options.method,
          data: options.json,
          params: options.params,
          headers: options.headers
        }
        
        if (options.url.startsWith("https:") && options.httpsOptions) {
          const httpsAgent = new https.Agent(options.httpsOptions);
          axios_settings.httpsAgent = httpsAgent;
        }
        else if (options.url.startsWith("https:") && !options.httpsOptions) {
          // HTTPS default is rejectUnauthorized: false
          const httpsAgent = new https.Agent({
            rejectUnauthorized: false,
          });
          axios_settings.httpsAgent = httpsAgent;
        }

        axios(axios_settings)
        .then(function (res) {
          winston.debug("Response for url: " + options.url);
          winston.debug("Response headers: ", res.headers);
          
          if (res && res.status == 200 && res.data) {
            if (callback) {
              callback(null, res.data);
            }
          }
          else {
            
            if (callback) {
              callback(Utils.getErr({message: "Response status not 200"}, options, res), null, null);
            }
          }
        })
        .catch(function (error) {
          winston.error("Request Error: ", error); 
          if (callback) {
            callback(error, null, null);
          }
        });
    }

    static getErr(err, request, response) {
        let res_err = {}
        res_err.http_err = err;
        res_err.http_request = request;
        res_err.http_response = response;
        return res_err;
    }

    static fixToken(token) {
        if (token.startsWith('JWT ')) {
            return token;
        }
        else {
            return 'JWT ' + token;
        }
    }




}

module.exports = Utils