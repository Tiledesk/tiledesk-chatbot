

const { Logger } = require('../../Logger');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');
const winston = require('../../utils/winston');

let levels = ['error', 'warn', 'info', 'debug'];

class DirFlowLog {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.log = context.log;

    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest.draft });
  }

  execute(directive, callback) {
    winston.verbose("Execute FlowLog directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirGptTask Incorrect directive: ", directive);
      callback();
      return;
    }

    this.go(action, () => {
      callback();
    })
  }

  async go(action, callback) {
    winston.debug("(DirFlowLog) Action: ", action);

    let level = action.level || 'info';
    if (!levels.includes(level)) {
      winston.warn("Invalid log level " + level);
      this.logger.error("Invalid log level: " + level);
      callback();
    }

    if (!action.log) {
      winston.debug("Log text is empty");
      callback();
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );

    const filler = new Filler();
    const filled_log = filler.fill(action.log, requestVariables);
    winston.debug("(DirFlowLog) fille log: ", filled_log);

    if (level === 'error') {
      winston.info("Adding log '" + filled_log + "' with level " + level);
      this.logger.error(filled_log);
    }
    else if (level === 'warn') {
      winston.info("Adding log '" + filled_log + "' with level " + level);
      this.logger.warn(filled_log);
    }
    else if (level === 'info') {
      winston.info("Adding log '" + filled_log + "' with level " + level);
      this.logger.info(filled_log);
    }
    else if (level === 'debug') {
      winston.info("Adding log '" + filled_log + "' with level " + level);
      this.logger.debug(filled_log);
    }

    callback();
  }
}

module.exports = { DirFlowLog };