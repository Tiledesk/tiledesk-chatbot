const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
let https = require("https");
require('dotenv').config();

class DirMake {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.log = context.log;
  }

  execute(directive, callback) {
    if (this.log) { console.log("DirMake directive: ", directive); }
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("DirMake Incorrect directive: ", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("DirMake action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirMake tdcache is mandatory");
      callback();
      return;
    }
    console.log('DirMake work!');
    callback();
    return;

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    if (this.log) {
      const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
      for (const [key, value] of Object.entries(all_parameters)) {
        if (this.log) { console.log("DirMake request parameter:", key, "value:", value, "type:", typeof value) }
      }
    }

    const filler = new Filler();
    const tracking_number = filler.fill(action.trackingNumber, requestVariables);
    // let tracking_number = await this.context.chatbot.getParameter(action.trackingNumber);
    if (this.log) {console.log("DirMake tracking number: ", tracking_number); }

    if (!tracking_number || tracking_number === '') {
      console.error("DirMake ERROR - tracking number is undefined or null or empty string");
      callback();
    }

    const qapla_base_url = process.env.QAPLA_ENDPOINT || "https://api.qapla.it/1.2"
    if (this.log) { console.log("DirMake QaplaEndpoint URL: ", qapla_base_url); }
    const QAPLA_HTTPREQUEST = {
      url: qapla_base_url + "/getShipment/",
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        apiKey: action.apiKey,
        trackingNumber: tracking_number
      },
      method: "GET"
    }
    if (this.log) { console.log("DirMake QAPLA_HTTPREQUEST", QAPLA_HTTPREQUEST); }

    this.#myrequest(
      QAPLA_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
            console.error("(httprequest) DirMake getShipment err:", err);
            callback();
          }
        } else if (callback) {
          if (this.log) { console.log("DirMake getShipment resbody: ", resbody); }

          let status = null;;
          let result;
          let error;

          if (resbody.getShipment &&
              resbody.getShipment.shipments &&
              resbody.getShipment.shipments[0] &&
              resbody.getShipment.shipments[0].status &&
              resbody.getShipment.shipments[0].status.qaplaStatus &&
              resbody.getShipment.shipments[0].status.qaplaStatus.status) {
                status = resbody.getShipment.shipments[0].status.qaplaStatus.status;
              }
          
          result = resbody.getShipment.result;
          error = resbody.getShipment.error;
          await this.#assignAttributes(action, status, result, error);
          callback();
        }
      }
    )

  }


  async #assignAttributes(action, status, result, error) {
    if (this.log) {
      console.log("DirMake assignAttributes action:", action)
      console.log("DirMake assignAttributes status:", status)
      console.log("DirMake assignAttributes result:", result)
      console.log("DirMake assignAttributes error:", error)
    }
    if (this.context.tdcache) {
      if (action.assignStatusTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignStatusTo, status);
      }
      if (action.assignResultTo && result) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignResultTo, result);
      }
      if (action.assignErrorTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignErrorTo, error);
      }

      // Debug log
      if (this.log) {
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          if (this.log) { console.log("DirMake request parameter:", key, "value:", value, "type:", typeof value) }
        }
      }
    }
  }

  #myrequest(options, callback) {
    if (this.log) {
      console.log("API URL:", options.url);
      console.log("** Options:", JSON.stringify(options));
    }
    let axios_options = {
      url: options.url,
      method: options.method,
      params: options.params,
      headers: options.headers
    }
    if (options.json !== null) {
      axios_options.data = options.json
    }
    if (this.log) {
      console.log("axios_options:", JSON.stringify(axios_options));
    }
    if (options.url.startsWith("https:")) {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });
      axios_options.httpsAgent = httpsAgent;
    }
    axios(axios_options)
      .then((res) => {
        if (this.log) {
          console.log("Response for url:", options.url);
          console.log("Response headers:\n", JSON.stringify(res.headers));
        }
        if (res && res.status == 200 && res.data) {
          if (callback) {
            callback(null, res.data);
          }
        }
        else {
          if (callback) {
            callback(new Error("Response status is not 200"), null);
          }
        }
      })
      .catch((error) => {
        // console.error("An error occurred:", JSON.stringify(error.data));
        if (callback) {
          callback(error, null);
        }
      });
  }
}

module.exports = { DirQapla }