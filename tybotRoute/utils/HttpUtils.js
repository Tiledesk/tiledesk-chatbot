let axios = require('axios');
const http = require('http');
const https = require('https');
const winston = require('./winston');

/**
 * When TYBOT_HTTP_KEEP_ALIVE is set to 1, true, yes, or on (case-insensitive),
 * axios uses shared http(s).Agent instances with keepAlive: true so connections
 * to the same host can be reused (e.g. chained /exec calls).
 */
function isHttpClientKeepAliveEnabled() {
  const v = process.env.TYBOT_HTTP_KEEP_ALIVE;
  if (v === undefined || String(v).trim() === '') {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
}

const HTTP_CLIENT_KEEP_ALIVE = isHttpClientKeepAliveEnabled();

let sharedHttpAgent = null;
let sharedHttpsAgent = null;

function getSharedHttpAgent() {
  if (!sharedHttpAgent) {
    sharedHttpAgent = new http.Agent({ keepAlive: true });
  }
  return sharedHttpAgent;
}

function getSharedHttpsAgent() {
  if (!sharedHttpsAgent) {
    sharedHttpsAgent = new https.Agent({
      keepAlive: true,
      rejectUnauthorized: false,
    });
  }
  return sharedHttpsAgent;
}

if (HTTP_CLIENT_KEEP_ALIVE) {
  winston.info(
    '[HttpUtils] HTTP client keep-alive: ENABLED — shared agents reuse TCP connections (TYBOT_HTTP_KEEP_ALIVE=1). ' +
    'Verbose logs include round-trip time (ms) and [keep-alive client: on].'
  );
} else {
  winston.info(
    '[HttpUtils] HTTP client keep-alive: disabled (default). Set TYBOT_HTTP_KEEP_ALIVE=1|true|yes|on to enable. ' +
    'Verbose logs include round-trip time (ms) and [keep-alive client: off].'
  );
}

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
    if (options.url.startsWith('https:')) {
      if (HTTP_CLIENT_KEEP_ALIVE) {
        axios_options.httpsAgent = getSharedHttpsAgent();
      } else {
        const httpsAgent = new https.Agent({
          rejectUnauthorized: false,
        });
        axios_options.httpsAgent = httpsAgent;
      }
    } else if (options.url.startsWith('http:')) {
      if (HTTP_CLIENT_KEEP_ALIVE) {
        axios_options.httpAgent = getSharedHttpAgent();
      }
    }

    const requestStarted = process.hrtime.bigint();
    const httpRoundTripMs = () => Number(process.hrtime.bigint() - requestStarted) / 1e6;
    const keepAliveTag = HTTP_CLIENT_KEEP_ALIVE ? 'on' : 'off';

    axios(axios_options)
      .then((res) => {
        const ms = httpRoundTripMs();
        if (res && (res.status >= 200 && res.status <= 299) && res.data) {
          winston.info(
            `[HttpUtils] ${options.method || 'GET'} ${options.url} completed in ${ms.toFixed(2)}ms ` +
            `(HTTP ${res.status}) [keep-alive client: ${keepAliveTag}]`
          );
          if (callback) {
            callback(null, res.data);
          }
        }
        else {
          const status = res && res.status != null ? res.status : 'n/a';
          winston.info(
            `[HttpUtils] ${options.method || 'GET'} ${options.url} completed in ${ms.toFixed(2)}ms ` +
            `(unexpected response, status ${status}) [keep-alive client: ${keepAliveTag}]`
          );
          if (callback) {
            callback(new Error("Response status is not 2xx"), null);
          }
        }
      })
      .catch((error) => {
        const ms = httpRoundTripMs();
        const status = error.response?.status;
        const statusPart = status != null ? `HTTP ${status}` : 'no HTTP response';
        winston.verbose(
          `[HttpUtils] ${options.method || 'GET'} ${options.url} failed after ${ms.toFixed(2)}ms ` +
          `(${statusPart}) [keep-alive client: ${keepAliveTag}]`
        );
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