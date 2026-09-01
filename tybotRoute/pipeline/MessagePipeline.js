const winston = require('../utils/winston');

class MessagePipeline {

  /**
   * @example
   * const { MessagePipeline } = require('./MessagePipeline');
   * 
   */

  constructor(answer, context) {
    this.context = context;
    this.message = answer;
    this.plugs = [];
    this.counter = -1;
  }

  addPlug(plug) {
    this.plugs.push(plug);
  }

  exec(completionCallback) {
    this.completionCallback = completionCallback;
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.nextplug();
    });
  }
  
  /*
exec(completionCallback) {
    this.completionPromise = new Promise((resolve, reject) => {
      const plug = this.nextplug();
      if (!plug) {
        if (completionCallback) {
            completionCallback();
          }
          return resolve();
      }
      else {
        plug.exec(this, () => {
          if (completionCallback) {
            completionCallback();
          }
          return resolve();
        });
      }
    });
    return this.completionPromise;
  }
  */
  
  /*execOn(message, context, completionCallback) {
    return new Promise((resolve, reject) => {
      this.message = message;
      this.process(this.nextplug(), context, (message) => {
        if (completionCallback) {
          completionCallback(message);
        }
        return resolve(message);
      });
    });
  }*/

  /*process(plug, context, completionCallback) {
    if (plug) {
      plug.execOn(this.message, context, () => {
        this.process(this.nextplug(), context, completionCallback);
      });
    }
    else {
      completionCallback(this.message);
    }
  }*/

  nextplug() {
    this.counter += 1;
    winston.verbose("(MessagePipeline) processing plug: " + this.coounter);
    if (this.counter < this.plugs.length) {
      winston.verbose("(MessagePipeline) Still plugs...")
      let nextp = this.plugs[this.counter];
      nextp.exec(this);
    }
    else {
      winston.verbose("(MessagePipeline) no more plugs");
      this.resolve(this.message);
    }
  }
  /*
  nextplug() {
    this.counter += 1;
    if (this.counter < this.plugs.length) {
      let nextp = this.plugs[this.counter];
      return nextp;
    }
    else {
      return null;
    }
  }
  */
  
}

module.exports = { MessagePipeline };