class MessagePipeline {

  /**
   * @example
   * const { MessagePipeline } = require('./MessagePipeline');
   * 
   */

  constructor(message, context) {
    this.context = context;
    this.message = message;
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
      console.log("The context", context)
      const plug = this.nextplug();
      if (!plug) {
        console.log("NO PLUGS!");
        if (completionCallback) {
            console.log("completionCallback found.");
            completionCallback();
          }
          console.log("Resolving...", this.message);
          return resolve();
      }
      else {
        plug.exec(this, () => {
          if (completionCallback) {
            console.log("completionCallback found.");
            completionCallback();
          }
          console.log("Resolving...", this.message);
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
      console.log("The context", context)
      this.process(this.nextplug(), context, (message) => {
        console.log("All plugs processed.", message)
        if (completionCallback) {
          console.log("completionCallback found.")
          completionCallback(message);
        }
        console.log("Resolving...", message)
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
    console.log(`processing plug[${this.counter}]`);
    if (this.counter < this.plugs.length) {
      console.log("Still plugs...")
      let nextp = this.plugs[this.counter];
      //console.log("nextp is:", nextp)
      nextp.exec(this);
    }
    else {
      console.log("no more plugs");
      this.resolve(this.message);
    }
  }
  /*
  nextplug() {
    this.counter += 1;
    console.log(`processing plug[${this.counter}]`);
    if (this.counter < this.plugs.length) {
      let nextp = this.plugs[this.counter];
      return nextp;
    }
    else {
      console.log("no more plugs");
      return null;
    }
  }
  */
  
}

module.exports = { MessagePipeline };