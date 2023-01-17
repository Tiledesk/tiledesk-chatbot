
class DirClose {

    constructor(context) {
        if (!context) {
            throw new Error('context object is mandatory.');
        }
        this.context = context;
        this.tdclient = context.tdclient;
        this.requestId = context.requestId;
    }
    
    execute(directive, callback) {
        this.tdclient.closeRequest(this.requestId, (err) => {
            if (err) {
                console.error("Error in 'close directive':", err);
            }
            else {
                // console.log("Successfully closed on close()");
            }
            callback();
        });
    }

  }
  
  module.exports = { DirClose };