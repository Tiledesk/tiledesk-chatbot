const { Directives } = require('./Directives');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskChatbotConst } = require('../../engine/TiledeskChatbotConst');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');
const { AnalyticsClient } = require('../../AnalyticsClient');

class DirMoveToAgent {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.API_ENDPOINT = context.API_ENDPOINT;
    
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" }); 
  }

  execute(directive, callback) {
    winston.verbose("Execute MoveToAgent directive");
    const action = directive.action || {};
    this.go(action, () => {
      this.logger.native("[Transfer to a Human] Executed");
      callback();
    });
  }

  async go(action, callback) {
    this.tdClient.moveToAgent(this.requestId, (err) => {
      if (err) {
        winston.error("DirMoveToAgent) Error moving to agent: ", err);
      }
      else {
        // Successfully moved to agent. Only track published (production) runs
        // (root/draft copy has no root_id).
        if (this.context.chatbot?.bot.root_id) {
          AnalyticsClient.track('handover_to_human', this.context.projectId, {
            id_request:           this.requestId,
            human_id:             null,
            reason:               'bot_directive',
            department_id:        this.context.departmentId || null,
            waiting_time_seconds: null,
            agent_id:             this.context.chatbot?.bot.root_id,
            trigger_intent:       this.context.reply?.attributes?.intent_info?.intent_name || null
          });
        }
      }

      const departmentId = action.departmentId;
      if (departmentId) {
        this.moveToDepartment(this.requestId, departmentId, (deps) => {
          if (deps) {
            winston.debug("DirMoveToAgent) Moved to department: ", deps);
          }
          else {
            winston.error("DirMoveToAgent) Error moving to department");
          }
          callback();
        });
      }
      else {
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
        callback();
      }
    });
  }

}

module.exports = { DirMoveToAgent };
