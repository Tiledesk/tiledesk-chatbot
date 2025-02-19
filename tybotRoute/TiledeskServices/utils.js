let axios = require('axios');
let https = require("https");

class Utils {
    constructor(){}


    static myrequest(options, callback, log) {
        if (log) {
          console.log("** API URL:", options.url);
          console.log("** Options:", JSON.stringify(options));
        }
        let axios_settings = {
          url: options.url,
          method: options.method,
          data: options.json,
          params: options.params,
          headers: options.headers
        }
        // console.log("options.url.startsWith(https:)", options.url.startsWith("https:"))
        // console.log("this.httpsOptions", this.httpsOptions)
        
        if (options.url.startsWith("https:") && options.httpsOptions) {
          // console.log("Tiledesk Client v 0.9.x: url.startsWith https: && httpsOptions");
          const httpsAgent = new https.Agent(options.httpsOptions);
          axios_settings.httpsAgent = httpsAgent;
        }
        else if (options.url.startsWith("https:") && !options.httpsOptions) {
          // HTTPS default is rejectUnauthorized: false
          // console.log("Tiledesk Client v 0.9.x: url.startsWith https: && NOT httpsOptions");
          const httpsAgent = new https.Agent({
            rejectUnauthorized: false,
          });
          axios_settings.httpsAgent = httpsAgent;
        }


        
        // console.log("Using axios settings:", axios_settings)
        // axios(
        //   {
        //     url: options.url,
        //     method: options.method,
        //     data: options.json,
        //     params: options.params,
        //     httpsAgent: httpsAgent,
        //     headers: options.headers
        //   })
        axios(axios_settings)
        .then(function (res) {
          if (log) {
            console.log("Response for url:", options.url);
            console.log("Response headers:\n", JSON.stringify(res.headers));
            // console.log("******** Response for url:", res);
          }
          
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
          // console.error(error); 
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


}

module.exports = Utils