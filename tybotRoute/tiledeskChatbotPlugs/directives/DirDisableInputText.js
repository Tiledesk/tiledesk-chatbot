const winston = require('../../utils/winston');

// DEPRECATED
class DirDisableInputText {

  constructor() {
  }

  execute(directive, pipeline, callback) {
    winston.verbose("Execute DisableInputText directive");
    let message = pipeline.message
    if (!message.attributes) {
      message.attributes = {}
    }
    message.attributes.disableInputMessage = true;
    callback();
  }
}

module.exports = { DirDisableInputText };