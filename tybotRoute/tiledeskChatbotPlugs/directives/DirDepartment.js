
class DirDepartment {

  constructor(config) {
    if (!config.tdclient) {
      throw new Error('tdclient (TiledeskClient) object is mandatory.');
    }
    this.tdclient = config.tdclient;
    this.log = config.log;
    this.requestId = config.requestId;
  }

  execute(directive, callback) {
    if (this.log) {console.log("DirDepartment:", dep_name);}
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      dep_name = "default department";
      if (directive.parameter) {
        dep_name = directive.parameter;
      }
      action = {
        body: {
          depName: dep_name
        }
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
    this.moveToDepartment(this.requestId, action.body.depName, () => {
      callback();
    });
  }

  moveToDepartment(requestId, depName, callback) {
    this.tdclient.getAllDepartments((err, deps) => {
      if (this.log) {console.log("deps:", deps, err);}
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
        this.tdclient.updateRequestDepartment(requestId, dep._id, null, (err) => {
          if (err) {
            console.error("DirDepartment error:", err);
            callback();
          }
          else {
            callback();
          }
        });
      }
    });
  }

}

module.exports = { DirDepartment };