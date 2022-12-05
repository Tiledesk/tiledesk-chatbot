
class DirClose {

    constructor(config) {
        if (!config.tdclient) {
            throw new Error('config.tdclient (TiledeskClient) object is mandatory.');
        }
        this.tdclient = config.tdclient;
    }
    
    execute(directive, requestId, callback) {
        this.tdclient.closeRequest(requestId, (err) => {
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