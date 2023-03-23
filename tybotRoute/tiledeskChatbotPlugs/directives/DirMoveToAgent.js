// const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { Directives } = require('./Directives');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskChatbotConst } = require('../../models/TiledeskChatbotConst');

class DirMoveToAgent {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    // let context =  {
    //   projectId: projectId,
    //   token: token,
    //   supportRequest: supportRequest,
    //   requestId: supportRequest.request_id,
    //   TILEDESK_APIURL: API_URL,
    //   TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
    //   departmentId: depId,
    //   tdcache: tdcache,
    //   log: false
    // }
    // new TiledeskClient({
    //   projectId: context.projectId,
    //   token: context.token,
    //   APIURL: context.TILEDESK_APIURL,
    //   APIKEY: "___",
    //   log: context.log
    // });
    this.tdclient = context.tdclient;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    // this.depId = context.departmentId;
    this.log = context.log;
  }

  execute(directive, callback) {
    directive.action = {};
    // if (directive.name === Directives.WHEN_ONLINE_MOVE_TO_AGENT) { // TEMP
    //   directive.action = {
    //     whenOnlineOnly: true
    //   }
    // }
    this.go(directive.action, () => {
      callback();
    });
  }

  async go(action, callback) {
    // let depId = null;
    // if (this.log) {console.log("DirMoveToAgent this.context.departmentId:", this.context.departmentId);}
    // if (this.context.departmentId) {
    //   depId = this.context.departmentId
    //   if (this.log) {console.log("DirMoveToAgent depId:", depId);}
    // }
    // else if (this.tdcache) {
    //   depId = 
    //   await TiledeskChatbot.getParameterStatic(
    //     this.tdcache, this.requestId, TiledeskChatbotConst.REQ_DEPARTMENT_ID_KEY
    //   );
    //   if (this.log) {console.log("DirMoveToAgent depId (cache):", depId);}
    // }
    // if (this.log) {console.log("DirMoveToAgent anyway depId is:", depId);}
    // if (action.whenOnlineOnly === true) {
    //   this.tdclient.openNow( async (err, result) => {
    //     if (err) {
    //       console.error("Agent in DirOfflineHours Error:", err);
    //       callback();
    //     }
    //     else {
    //       if (result && result.isopen) {
    //         // if (depId) {
    //           // this.tdclient.agent(this.requestId, depId, (err) => {
    //           this.tdclient.moveToAgent(this.requestId, (err) => {
    //             if (err) {
    //               console.error("Error moving to agent during online hours:", err);
    //             }
    //             else {
    //               console.log("Successfully moved to agent during online hours");
    //             }
    //             callback();
    //           });
    //         // }
    //         // else {
    //         //   callback();
    //         // }
    //       }
    //       else {
    //         callback();
    //       }
    //     }
    //   });
    // }
    // else {
        // if (depId) {
          // this.tdclient.agent(this.requestId, depId, (err) => {
          this.tdclient.moveToAgent(this.requestId, (err) => {
            if (err) {
              console.error("Error moving to agent:", err);
            }
            else {
              console.log("Successfully moved to agent");
            }
            callback();
          });
        // }
        // else {
        //   callback();
        // }
      
    // }
  }

}

module.exports = { DirMoveToAgent };