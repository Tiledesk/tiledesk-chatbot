let axios = require('axios');
const { DirIntent } = require('./DirIntent');
let https = require("https");
const winston = require('../../utils/winston');
const httpUtils = require('../../utils/HttpUtils');
const { BaseDirective } = require('../BaseDirective');

class DirIfOpenHours extends BaseDirective {

  constructor(context) {
    super(context);

    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
    winston.verbose("Execute IfOpenHours directive");
    let action;
    if (directive.action) {
      action = directive.action
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirIfOpenHours Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[If Operating Hours] Action complteted");
      callback(stop);
    });
  }

  go(action, callback) {
    winston.debug("(DirIfOpenHours) Action: ", action);

    const trueIntent = action.trueIntent;
    const falseIntent = action.falseIntent;
    const trueIntentAttributes = action.trueIntentAttributes;
    const falseIntentAttributes = action.falseIntentAttributes;
    const stopOnConditionMet = action.stopOnConditionMet;
    
    if (trueIntent && trueIntent.trim() === "") {
      trueIntent = null;
    }
    if (falseIntent && falseIntent.trim() === "") {
      falseIntent = null;
    }

    if (!trueIntent && !falseIntent) {
      this.logger.error("[If Operating Hours] Invalid condition, no intents specified");
      winston.error("(DirIfOpenHours) Invalid condition, no intents specified");
      callback();
      return;
    }
    
    let slot_id = null;
    if (action.slotId) {
      slot_id = action.slotId;
    }
    
    let isopen_url = this.API_ENDPOINT + "/projects/" + this.context.projectId + "/isopen";
    if (slot_id) {
      isopen_url = isopen_url.concat("?timeSlot=" + slot_id);
    }

    const HTTPREQUEST = {
      url: isopen_url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'JWT ' + this.context.token
      },
      method: 'GET'
    }
    winston.debug("(DirIfOpenHours) HttpRequest ", HTTPREQUEST);
    
    httpUtils.request(
      HTTPREQUEST, async (err, resbody) => {

        winston.debug("(DirIfOpenHours) resbody:", resbody);
        
        if (err) {
          this.logger.error("[If Operating Hours] Error response: ", err.response);
          winston.debug("(DirIfOpenHours) error: ", err);
          if (callback) {
            if (falseIntent) {
              let intentDirective = DirIntent.intentDirectiveFor(falseIntent);
              winston.debug("(DirIfOpenHours) !agents (openHours) => falseIntent " + falseIntent);
              this.intentDir.execute(intentDirective, () => {
                callback(stopOnConditionMet);
              });
            }
          }
        } else {
          if (resbody.isopen && resbody.isopen === true) {
            this.logger.native("[If Operating Hours] is open: true")
            if (trueIntent) {
              let intentDirective = DirIntent.intentDirectiveFor(trueIntent);
              winston.debug("(DirIfOpenHours) agents (openHours) => trueIntent");
              this.intentDir.execute(intentDirective, () => {
                callback(stopOnConditionMet);
              });
            }
            callback();
            return;
          } else {
            this.logger.native("[If Operating Hours] is open: false")
            if (falseIntent) {
              let intentDirective = DirIntent.intentDirectiveFor(falseIntent);
              winston.debug("(DirIfOpenHours) !agents (openHours) => falseIntent", falseIntent);
              this.intentDir.execute(intentDirective, () => {
                callback(stopOnConditionMet);
              });
            }
            callback();
            return;
          }
        }
      }
    )

    // this.tdClient.openNow(action.slot_id, (err, result) => {

    //   if (err) {
    //     callback();
    //   }
    //   else if (result && result.isopen) {
    //     if (trueIntent) {
    //       let intentDirective = DirIntent.intentDirectiveFor(trueIntent);
    //       this.intentDir.execute(intentDirective, () => {
    //         callback(stopOnConditionMet);
    //       });
    //     }
    //     else {
    //       callback();
    //       return;
    //     }
    //   }
    //   else if (falseIntent) {
    //     let intentDirective = DirIntent.intentDirectiveFor(falseIntent);
    //     this.intentDir.execute(intentDirective, () => {
    //       callback(stopOnConditionMet);
    //     });
    //   }
    //   else {
    //     callback();
    //   }
    // });
  }

}

module.exports = { DirIfOpenHours };