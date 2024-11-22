const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { Filler } = require('../Filler');

class DirSetConversationTags {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.log = context.log;
    this.requestId = context.requestId;

    this.API_ENDPOINT = context.API_ENDPOINT;
    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___",
      log: this.log
    });
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
        action = directive.action
    }
    else {
        callback();
        return;
    }
    this.go(action, () => {
        callback();
    });
  }

  async go(action, callback) {
    if (this.log) {console.log("(DirSetConversationTags) Adding conversation tags:", action.depName);}
    let tagsString = action.tags;
    tagsString = tagsString.replace(/ /g,"");
    if (tagsString.length === 0) {
      if (this.log) {console.error("(DirSetConversationTags) Invalid action: tags string is empty")};
      callback();
      return;
    }
    try {
      if (this.tdcache) {
        const requestAttributes = 
            await TiledeskChatbot.allParametersStatic(this.tdcache, this.context.requestId);
        const filler = new Filler();
        tags = filler.fill(tags, requestAttributes);
      }
    }
    catch(error) {
        console.error("Error while filling operands:", error);
    }
    this.moveToDepartment(this.requestId, depName, (deps) => {
      if (!deps) {
        if (this.log) {console.log("Dep not found");}
        callback();
        return
      }
      if (this.log) {console.log("Switched to dept:", depName, "action:", JSON.stringify(action));}
      if (action.triggerBot) {
        let dep = null;
        let i;
        for (i = 0; i < deps.length; i++) {
          let d = deps[i];
          if (d.name.toLowerCase() === depName.toLowerCase()) {
            dep = d;
            break;
          }
        }
        if (dep && dep.hasBot === true && dep.id_bot) {
          if (this.log) {console.log("Sending hidden /start message to bot in dept");}
          const message = {
            type: "text",
            text: "/start",
            attributes : {
              subtype: "info"
            }
          }
          this.tdclient.sendSupportMessage(
            this.requestId,
            message, (err) => {
              if (err) {
                console.error("Error sending hidden message:", err.message);
              }
              if (this.log) {console.log("Hidden message sent.");}
              callback();
          });
        }
      }
      else {
        if (this.log) {console.log("No action.triggerBot");}
        callback();
      }
    });
  }

  moveToDepartment(requestId, depName, callback) {
    this.tdclient.getAllDepartments((err, deps) => {
      if (this.log) {console.log("deps:", JSON.stringify(deps));}
      if (err) {
        console.error("getAllDepartments() error:", err);
        callback();
        return;
      }
      let dep = null;
      let i;
      for (i = 0; i < deps.length; i++) {
        let d = deps[i];
        if (d.name.toLowerCase() === depName.toLowerCase()) {
          dep = d;
          break;
        }
      }
      if (dep) {
        this.tdclient.updateRequestDepartment(requestId, dep._id, null, (err, res) => {
          if (err) {
            console.error("DirDepartment error:", err);
            callback();
          }
          else {
            console.log("DirDepartment response:",JSON.stringify(res));
            callback(deps);
          }
        });
      }
    });
  }

}

module.exports = { DirSetConversationTags };