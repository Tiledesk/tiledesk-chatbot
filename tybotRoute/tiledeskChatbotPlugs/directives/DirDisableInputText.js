const ms = require('minimist-string');
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
    if (directive.parameter) {
      const options = this.parseParams(directive.parameter);
      directive.options = options;
      if (options.label) {
        message.attributes.inputMessagePlaceholder = options.label;
      }
    }
    callback();
  }

  parseParams(directive_parameter) {
    let label = null;
    const params = ms(directive_parameter);
    if (params.l) {
      label = params.l;
    }
    if (params.label) {
      label = params.label;
    }
    return {
      label: label
    }
  }
}

module.exports = { DirDisableInputText };