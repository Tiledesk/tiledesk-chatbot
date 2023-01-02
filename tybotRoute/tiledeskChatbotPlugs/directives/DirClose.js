
class DirClose {

    constructor(config) {
        if (!config.tdclient) {
            throw new Error('config.tdclient (TiledeskClient) object is mandatory.');
        }
        this.tdclient = config.tdclient;
        this.requestId = config.requestId;
    }
    
    execute(directive, callback) {
        this.tdclient.closeRequest(this.requestId, (err) => {
            if (err) {
                console.error("Error in 'close directive':", err);
            }
            else {
                //console.log("Successfully moved to agent during online hours");
            }
            callback();
        });
    }

  }
  
  module.exports = { DirClose };