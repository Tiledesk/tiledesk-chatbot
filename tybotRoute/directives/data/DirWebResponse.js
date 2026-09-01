const { Filler } = require('../../variables/Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../utils/TiledeskChatbotUtil');
const winston = require('../../utils/winston');
const { BaseDirective } = require('../BaseDirective');
const { Directives } = require('../Directives');

class DirWebResponse extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.WEB_RESPONSE];

  execute(directive, callback) {
    winston.debug("Execute WebResponse directive: ", directive);
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.debug("DirWebResponse Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
      this.logger.native("[Web Response] Executed");
        callback();
    }).catch((err) => {
      // go() rejects only to abort itself after an error exit has already
      // called back (the shape DirWebRequestV2.execute uses). Anything else
      // would otherwise become an unhandled rejection.
      winston.debug("DirWebResponse go() aborted: ", err);
    });
  }

  async go(action, callback) {
    winston.debug("DirWebResponse action: ", action);
    
    if (!this.tdcache) {
      winston.error("DirWebResponse Error: tdcache is mandatory");
      callback();
      return;
    }
    
    let requestAttributes = null;
    requestAttributes = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
        );
    
    const filler = new Filler();
    const filled_status = filler.fill(action.status, requestAttributes);
    // getJsonFromAction REJECTS on a payload that is not valid json. Awaiting
    // it with no .catch() rejected go(), and since execute() did not await
    // go() the rejection was unhandled: nothing was published and the callback
    // never fired. Same .catch() shape as the identical helper in
    // DirWebRequestV2.
    const json = await this.getJsonFromAction(action, filler, requestAttributes).catch((err) => {
      winston.error("DirWebResponse Error parsing json payload: ", err);
      callback();
      return Promise.reject(err);
    })

    let webResponse = {
      status: filled_status,
      payload: json
    }

    this.logger.native("[Web Response] payload: ", webResponse);

    const topic = `/webhooks/${this.requestId}`;
    
    try {
      this.tdcache.publish(topic, JSON.stringify(webResponse));
      winston.verbose("DirWebResponse Published webresponse to topic: " + topic);
    }
    catch(e) {
      winston.error("DirWebResponse Error: ", e)
    }

    callback();
    
  }

  async getJsonFromAction(action, filler, requestAttributes) {
  
      return new Promise( async (resolve, reject) => {
  
        if (action.payload && action.bodyType == "json") {
          let jsonBody = filler.fill(action.payload, requestAttributes);
          try {
            let json = JSON.parse(jsonBody);
            resolve(json);
          }
          catch (err) {
            winston.error("Error parsing webRequest jsonBody: " + JSON.stringify(jsonBody) + "\nError: " + JSON.stringify(err));
            this.logger.error("[Web Response] Error parsing webRequest jsonBody ", jsonBody)
            reject("Error parsing jsonBody");
          }
        }
        else {
          resolve(null);
        }
      })
  }

}

module.exports = { DirWebResponse };