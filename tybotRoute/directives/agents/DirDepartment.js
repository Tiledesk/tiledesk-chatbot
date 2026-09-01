const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const winston = require('../../utils/winston');
const { BaseDirective } = require("../BaseDirective");
const { Directives } = require('../Directives');

class DirDepartment extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.DEPARTMENT];

  constructor(context) {
    super(context);
    this.log = context.log;

    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
  }

  execute(directive, callback) {
    winston.verbose("Execute Department directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      let dep_name = "default department";
      if (directive.parameter) {
        dep_name = directive.parameter.trim();
      }
      action = {
        depName: dep_name
      }
    }
    this.go(action, () => {
      this.logger.native("[Change Department] Action executed");
      callback();
    });
    
  }

  // example dept
  //   {
  //     "routing": "assigned",
  //     "default": false,
  //     "status": 0,
  //     "_id": "65204737f8c0cf002cf41a60",
  //     "name": "dep2",
  //     "id_project": "65203e12f8c0cf002cf4110b",
  //     "createdBy": "5e09d16d4d36110017506d7f",
  //     "tags": [],
  //     "createdAt": "2023-10-06T17:43:19.991Z",
  //     "updatedAt": "2023-10-07T15:28:31.775Z",
  //     "__v": 0,
  //     "id_bot": "65204767f8c0cf002cf41ada",
  //     "id_group": null,
  //     "hasBot": true,
  //     "id": "65204737f8c0cf002cf41a60"
  // }

  go(action, callback) {
    winston.debug("(DirDepartment) Action: ", action);
    const depName = action.depName;
    this.moveToDepartment(this.requestId, depName, (deps) => {
      if (!deps) {
        this.logger.warn("[Change Department] Department not found");
        winston.warn("(DirDepartment) Dep not found");
        callback();
        return
      }
      winston.debug("(DirDepartment) Switched to dept: " + depName + " action: " + JSON.stringify(action));
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
          winston.debug("(DirDepartment) Sending hidden /start message to bot in dept");
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
                this.logger.error("[Change Department] Unable to trigger bot");
                winston.error("(DirDepartment) Error sending hidden message: " + err.message)
              } else {
                this.logger.native("[Change Department] Bot triggered");
                winston.debug("(DirDepartment) Hidden message sent.");

              }
              callback();
          });
        }
        else {
          // Without this the callback was only reachable inside
          // `if (dep && dep.hasBot === true && dep.id_bot)`: routing to a
          // department that has no bot stalled the conversation silently.
          this.logger.native("[Change Department] No bot to trigger in the department");
          winston.debug("(DirDepartment) No bot to trigger in dept: " + depName);
          callback();
        }
      }
      else {
        this.logger.native("[Change Department] No triggering bot");
        winston.debug("(DirDepartment) No action.triggerBot");
        callback();
      }
    });
  }

  moveToDepartment(requestId, depName, callback) {
    this.tdClient.getAllDepartments((err, deps) => {
      winston.debug("(DirDepartment) deps: ", deps);
      if (err) {
        winston.error("(DirDepartment) getAllDepartments() error: ", err);
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
            winston.error("(DirDepartment) updatedRequestDepartment error: ", err);
            callback();
          }
          else {
            winston.debug("(DirDepartment) response: ", res); 
            callback(deps);
          }
        });
      }
      else {
        // Without this the `if (dep)` had no else: when no department carried
        // the configured name nothing called back, go() never resolved and the
        // conversation stalled silently. Calling back with no deps reaches the
        // "Department not found" warning in go(), which was unreachable before.
        winston.warn("(DirDepartment) No department named: " + depName);
        callback();
      }
    });
  }

}

module.exports = { DirDepartment };