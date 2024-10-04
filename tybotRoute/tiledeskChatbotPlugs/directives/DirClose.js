
class DirClose {

    constructor(context) {
        if (!context) {
            throw new Error('context object is mandatory.');
        }
        this.context = context;
        this.tdclient = context.tdclient;
        this.requestId = context.requestId;
        this.chatbot = context.chatbot;
    }
    
    execute(directive, callback) {
        this.tdclient.closeRequest(this.requestId, async (err) => {
            if (err) {
                console.error("Error in 'close directive':", err);
            }
            else {
                await this.chatbot.deleteParameter(TiledeskChatbotConst.USER_INPUT);
            }
            callback();
        });
    }

  }
  
  module.exports = { DirClose };