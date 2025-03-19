const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { Filler } = require('../Filler');
const winston = require('../../utils/winston');

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
    winston.verbose("Execute SetConversationTags directive");
    let action;
    if (directive.action) {
        action = directive.action
    }
    else {
        winston.warn("DirSetAttribute Incorrect directive: ", directive);
        callback();
        return;
    }
    this.go(action, () => {
        callback();
    });
  }

  async go(action, callback) {
    winston.debug("(DirSetConversationTags) Action: ", action);
    let tagsString = action.tags;
    tagsString = tagsString.replace(/ /g,"");
    if (tagsString.length === 0) {
      winston.debug("(DirSetConversationTags) Invalid action: tags string is empty");
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
      winston.error("(DirSetConversationTags) Error while filling operands: ", error);
    }
    this.moveToDepartment(this.requestId, depName, (deps) => {
      if (!deps) {
        winston.debug("(DirSetConversationTags) Dep not found");
        callback();
        return
      }
      winston.debug("(DirSetConversationTags) Switched to dept: " + depName + " action: ", JSON.stringify(action));
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
          winston.debug("(DirSetConversationTags) Sending hidden /start message to bot in dept");
          const message = {
            type: "text",
            text: "/start",
            attributes : {
              subtype: "info"
            }
          }
          this.tdClient.sendSupportMessage(
            this.requestId,
            message, (err) => {
              if (err) {
                winston.error("(DirSetConversationTags) Error sending hidden message: " + err.message);
              }
              callback();
          });
        }
      }
      else {
        winston.debug("(DirSetConversationTags) No action.triggerBot");
        callback();
      }
    });
  }

  moveToDepartment(requestId, depName, callback) {
    this.tdClient.getAllDepartments((err, deps) => {
      if (err) {
        winston.error("(DirSetConversationTags) getAllDepartments() error: ", err);
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
        this.tdClient.updateRequestDepartment(requestId, dep._id, null, (err, res) => {
          if (err) {
            winston.debug("(DirSetConversationTags) error:", err);
            callback();
          }
          else {
            winston.debug("(DirSetConversationTags) response: ", res);
            callback(deps);
          }
        });
      }
    });
  }

}

module.exports = { DirSetConversationTags };