
class DirDepartment {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.log = context.log;
    this.tdclient = context.tdclient;
    this.requestId = context.requestId;
  }

  execute(directive, callback) {
    // if (this.log) {console.log("DirDepartment:", dep_name);}
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
    if (this.log) {console.log("Switching to department:", action.depName);}
    const depName = action.depName;
    this.moveToDepartment(this.requestId, depName, (deps) => {
      if (this.log) {console.log("Switched to dept:", depName);}
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
            callback();
          }
        });
      }
    });
  }

}

module.exports = { DirDepartment };