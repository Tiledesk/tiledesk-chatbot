
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');

class DirWait {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdclient = context.tdclient;
    this.chatbot = context.chatbot;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.log = context.log;
  }

  execute(directive, callback) {
    //  500ms < wait-time < 10.000ms
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else if (directive.parameter) {
      let millis = 500;
      const _millis = parseInt(directive.parameter.trim());
      if (!Number.isNaN(millis)) {
        millis = _millis;
      }
      if (millis > 20000) {
        millis = 20000
      }
      else if (millis < 1000) {
        millis = 1000
      }
      action = {
        millis: millis
      }
    }
    else {
      action = {
        millis: 500
      }
    }
    // console.log("____-----_", action)
    this.go(action, () => {
      // console.log("YES", callback)
      callback();
    })
  }

  async go(action, callback) {
    // reset step
    const step_key = TiledeskChatbot.requestCacheKey(this.requestId) + ":step";
    console.log("step_key:", step_key);
    if (step_key) {
      await this.chatbot.addParameter( step_key, 0 );
      console.log("step_key after:", await this.chatbot.getParameter( step_key ));
      
    }
    setTimeout(() => {
      callback();
    }, action.millis);
  }
}

module.exports = { DirWait };