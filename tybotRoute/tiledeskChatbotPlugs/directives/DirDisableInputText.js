const ms = require('minimist-string');

// DEPRECATED
class DirDisableInputText {

  constructor() {
  }

  execute(directive, pipeline, callback) {
    // console.log("disable input text...pipeline");
    let message = pipeline.message
    if (!message.attributes) {
      message.attributes = {}
    }
    message.attributes.disableInputMessage = true;
    if (directive.parameter) {
      const options = this.parseParams(directive.parameter);
      // console.log("Options", options)
      directive.options = options;
      if (options.label) {
        // console.log("options.label", options.label)
        message.attributes.inputMessagePlaceholder = options.label;
      }
    }
    callback();
  }

  parseParams(directive_parameter) {
    let label = null;
    const params = ms(directive_parameter);
    // console.log("params:", params);
    if (params.l) {
      // console.log("_param l", params.l);
      label = params.l;
    }
    if (params.label) {
      // console.log("_param label", params.label);
      label = params.label;
    }
    return {
      label: label
    }
  }
}

module.exports = { DirDisableInputText };