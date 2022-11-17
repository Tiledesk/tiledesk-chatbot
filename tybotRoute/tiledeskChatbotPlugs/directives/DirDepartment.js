
class DirDepartment {

  constructor(tdclient) {
    if (!tdclient) {
      throw new Error('tdclient (TiledeskClient) object is mandatory.');
    }
    this.tdclient = tdclient;
  }

  moveToDepartment(tdclient, requestId, depName, callback) {
    tdclient.getAllDepartments((err, deps) => {
      console.log("deps:", deps, err);
      if (err) {
        console.error("getAllDepartments() error:", err);
        callback(err);
        return;
      }
      let dep = null;
      for (i = 0; i < deps.length; i++) {
        d = deps[i];
        if (d.name.toLowerCase() === depName.toLowerCase()) {
          dep = d;
          break;
        }
      }
      if (dep) {
        tdclient.updateRequestDepartment(requestId, dep._id, null, (err) => {
          if (err) {
            console.error("An error:", err);
            callback(err);
          }
          else {
            callback();
          }
        });
      }
    });
  }
  
  execute(requestId, dep_name, callback) {
    console.log("DirDepartment:", dep_name);
    this.moveToDepartment(tdclient, requestId, dep_name, () => {
      console.log("moved to department:", dep_name);
      callback());
    });
  }
}

module.exports = { DirDepartment };