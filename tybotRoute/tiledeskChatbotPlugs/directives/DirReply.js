const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../models/TiledeskChatbotUtil');

class DirReply {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.projectId = context.projectId;
    this.requestId = context.requestId;
    this.token = context.token;
    this.tdcache = context.tdcache;
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action;
      if (!action.attributes) {
        action.attributes = {}
      }
      action.attributes.fillParams = true;
    }
    else {
      console.error("Incorrect directive (no action provided):", directive);
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    const message = action;
    // fill
    let requestAttributes = null;
    if (this.tdcache) {
      requestAttributes = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );
      if (this.log) {
        for (const [key, value] of Object.entries(requestAttributes)) {
          const value_type = typeof value;
          // if (this.log) {console.log("(DirReply) request parameter:", key, "value:", value, "type:", value_type)}
        }
      }
      const filler = new Filler();
      // fill text attribute
      message.text = filler.fill(message.text, requestAttributes);
      if (this.log) {console.log("filling commands'. Message:", JSON.stringify(message));}
      if (message.attributes && message.attributes.commands) {
        if (this.log) {console.log("filling commands'. commands found.");}
        let commands = message.attributes.commands;
        if (this.log) {console.log("commands:", JSON.stringify(commands), commands.length);}
        if (commands.length > 0) {
          if (this.log) {console.log("commands' found");}
          for (let i = 0; i < commands.length; i++) {
            let command = commands[i];
            if (command.type === 'message' && command.message && command.message.text) {
              command.message.text = filler.fill(command.message.text, requestAttributes);
              TiledeskChatbotUtil.fillCommandAttachments(command, requestAttributes, this.log);
              if (this.log) {console.log("command filled:", command.message.text);}
            }
          }
        }
      }

      // EVALUATE EXPRESSION AND REMOVE BASED ON EVALUATION
      if (this.log) {console.log("message before filters:", JSON.stringify(message));}
      if (message.attributes && message.attributes.commands) {
        if (this.log) {console.log("filterOnVariables...on commands", JSON.stringify(message.attributes.commands));}
        if (this.log) {console.log("filterOnVariables...on attributes", requestAttributes);}
        // TiledeskChatbotUtil.filterOnVariables(message.attributes.commands, requestAttributes);
        TiledeskChatbotUtil.filterOnVariables(message, requestAttributes);
      }
      // temporary send back of reserved attributes
      if (!message.attributes) {
        message.attributes = {}
      }
      // Reserved names: userEmail, userFullname
      if (requestAttributes['userEmail']) {
          message.attributes.updateUserEmail = requestAttributes['userEmail'];
      }
      if (requestAttributes['userFullname']) {
        message.attributes.updateUserFullname = requestAttributes['userFullname'];
      }
      // intent_info
      if (this.context.reply && this.context.reply.attributes && this.context.reply.attributes.intent_info) {
        message.attributes.intentName = this.context.reply.attributes.intent_info.intent_name;
      }
    }
    // send!
    if (this.log) {console.log("Reply:", JSON.stringify(message))};
    // this.context.tdclient.sendSupportMessage(
    //   this.requestId,
    //   message,
    //   (err) => {
    //     if (err) {
    //       console.error("Error sending reply:", err.message);
    //     }
    //     if (this.log) {console.log("Reply message sent.");}
    //     callback();
    // });

    this.sendSupportMessage(
      this.requestId,
      message,
      (err) => {
        if (err) {
          console.error("Error sending reply:", err.message);
        }
        // if (this.log) {console.log("Reply message sent.");}
        console.log("Reply message sent.");
        callback();
      });
  }

  sendSupportMessage(requestId, message, callback) {
    // const jwt_token = TiledeskClient.fixToken(this.token);
    //const url = `${this.APIURL}/${this.projectId}/requests/${requestId}/messages`;
    const url = `${this.context.tdclient.APIURL}/${this.projectId}/requests/${requestId}/messages`
    const HTTPREQUEST = {
      url: url,
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': this.token
      },
      json: message,
      method: 'POST'
    };
    this.myrequest(
      HTTPREQUEST,
      function(err, response, resbody) {
        if (response.status === 200) {
          if (callback) {
            callback(null, resbody)
          }
        }
        else if (callback) {
          callback(err);
        }
      }, this.log
    );
  }

 myrequest(options, callback, log) {
  if (log) {
    console.log("API URL:", options.url);
    console.log("** Options:", JSON.stringify(options));
  }
  axios(
    {
      url: options.url,
      method: options.method,
      data: options.json,
      params: options.params,
      headers: options.headers
    })
    .then((res) => {
      // if (log) {
        console.log("Reply: Response for url:", options.url);
        console.log("Reply: Response headers:\n", JSON.stringify(res.headers));
        //console.log("******** Response for url:", res);
      // }
      if (res && res.status == 200 && res.data) {
        if (callback) {
          callback(null, res.data);
        }
      }
      else {
        if (callback) {
          console.error("Status ! 200");
          callback({ message: "Response status not 200" });
        }
      }
    })
    .catch((error) => {
      console.error("An error occurred:", error);
      if (callback) {
        callback(error, null, null);
      }
    });
  } 

}

module.exports = { DirReply };