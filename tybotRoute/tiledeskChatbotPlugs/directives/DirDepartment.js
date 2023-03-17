
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

  // execute(requestId, dep_name, callback) {
  //   if (this.log) {console.log("DirDepartment:", dep_name);}
  //   this.moveToDepartment(requestId, dep_name, () => {
  //     callback();
  //   });
  // }

  go(action, callback) {
    console.log("Switching to department:", action.depName);
    this.moveToDepartment(this.requestId, action.depName, () => {
      console.log("Switched, callbackalling");
      callback();
    });
  }

  moveToDepartment(requestId, depName, callback) {
    this.tdclient.getAllDepartments((err, deps) => {
      if (this.log) {console.log("deps:", deps);}
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