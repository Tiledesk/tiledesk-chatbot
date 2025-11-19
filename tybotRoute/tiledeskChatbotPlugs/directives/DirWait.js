
const { Logger } = require('../../Logger');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const winston = require('../../utils/winston');

class DirWait {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    console.log(`(GAB) called DirWait execute at : ${new Date().getTime()}, directive:`, directive)
    //  500ms < wait-time < 10.000ms
    winston.verbose("Execute Wait directive");
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

    this.go(action, () => {
      console.log(`(DirWait)  go callback exit at: ${new Date().getTime()} . . .` )
      this.logger.native("[Wait] Executed");
      callback();
    })
  }

  async go(action, callback) {
    winston.debug("(DirWait) Action: ", action);
    // reset step?
    // const step_key = TiledeskChatbot.requestCacheKey(this.requestId) + ":step";
    if (action && action.millis >= 1000) {//2000 * 60) { // at list 2 minutes waiting time to reset the steps counter
      // await this.tdcache.set(step_key, 0);
      let start1= new Date()
      await TiledeskChatbot.resetStep(this.tdcache, this.requestId);
      let end1 = new Date()
      console.log(`(GAB) called DirWait go() 1-> after TiledeskChatbot.resetStep at :  ${end1.getTime()}, diff: ${end1-start1}[ms]`)
       
    }
    console.log(`(GAB) called DirWait go() at :${new Date().getTime()}, millis: ${action.millis}`)
    this.logger.native("[Wait] Waiting for ", action.millis, "[ms]")
    setTimeout(() => {
      console.log(`(GAB) called DirWait go() settimeout at : ${new Date().getTime()}`)
      callback();
    }, action.millis);
  }
}

module.exports = { DirWait };