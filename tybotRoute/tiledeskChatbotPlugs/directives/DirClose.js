
class DirClose {

    constructor(config) {
        if (!config.tdclient) {
            throw new Error('config.tdclient (TiledeskClient) object is mandatory.');
        }
        this.tdclient = config.tdclient;
        this.requestId = config.requestId;
    }
    
    execute(directive, callback) {
        console.log("Exec close() directive on requestId", this.requestId);
        this.tdclient.log = true
        this.tdclient.closeRequest(this.requestId, (err) => {
            if (err) {
                console.error("Error in 'close directive':", err);
            }
            else {
                console.log("Successfully closed on close()");
            }
            callback();
        });
    }

  }
  
  module.exports = { DirClose };