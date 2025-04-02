let axios = require('axios');
let https = require("https");
const winston = require('./winston');

class HttpUtils {

  constructor() { }

  request(options, callback) {
    let axios_options = {
      url: options.url,
      method: options.method,
      params: options.params,
      headers: options.headers
    }
    if (options.json !== null) {
      axios_options.data = options.json
    }
    if (options.url.startsWith("https:")) {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });
      axios_options.httpsAgent = httpsAgent;
    }
    axios(axios_options)
      .then((res) => {
        if (res && (res.status >= 200 && res.status <= 299) && res.data) {
          if (callback) {
            callback(null, res.data);
          }
        }
        else {
          if (callback) {
            callback(new Error("Response status is not 2xx"), null);
          }
        }
      })
      .catch((error) => {
        if (error.response?.data) {
          if (typeof error.response.data === 'string') {
            winston.error("Axios error response data: " + error.response.data);
          } else {
            winston.error("Axios error response data: ", error.response.data);
          }
        } else if (error.response) {
          winston.error("Axios error response: ", error.response);
        } else {
          winston.error("Axios error: ", error);
        }
        if (callback) {
          callback(error, null);
        }
      });
  }

  // static myrequest(options, callback, log) {
  //     winston.verbose("** API URL: " + options.url);
  //     winston.debug("** Options: ", options);
  //     let axios_settings = {
  //       url: options.url,
  //       method: options.method,
  //       data: options.json,
  //       params: options.params,
  //       headers: options.headers
  //     }

  //     if (options.url.startsWith("https:") && options.httpsOptions) {
  //       const httpsAgent = new https.Agent(options.httpsOptions);
  //       axios_settings.httpsAgent = httpsAgent;
  //     }
  //     else if (options.url.startsWith("https:") && !options.httpsOptions) {
  //       // HTTPS default is rejectUnauthorized: false
  //       const httpsAgent = new https.Agent({
  //         rejectUnauthorized: false,
  //       });
  //       axios_settings.httpsAgent = httpsAgent;
  //     }

  //     axios(axios_settings)
  //     .then(function (res) {
  //       winston.debug("Response for url: " + options.url);
  //       winston.debug("Response headers: ", res.headers);

  //       if (res && res.status == 200 && res.data) {
  //         if (callback) {
  //           callback(null, res.data);
  //         }
  //       }
  //       else {

  //         if (callback) {
  //           callback(Utils.getErr({message: "Response status not 200"}, options, res), null, null);
  //         }
  //       }
  //     })
  //     .catch(function (error) {
  //       winston.error("Request Error: ", error); 
  //       if (callback) {
  //         callback(error, null, null);
  //       }
  //     });
  // }

  static getErr(err, request, response) {
    let res_err = {}
    res_err.http_err = err;
    res_err.http_request = request;
    res_err.http_response = response;
    return res_err;
  }

  fixToken(token) {
    if (token.startsWith('JWT ')) {
      return token;
    }
    else {
      return 'JWT ' + token;
    }
  }




}

const httpUtils = new HttpUtils();

module.exports = httpUtils;