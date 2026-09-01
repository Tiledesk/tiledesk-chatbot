const winston = require('../../utils/winston');
const { BaseDirective } = require('../BaseDirective');

// DEPRECATED
//
// This directive has no dispatch entry: Directives.DISABLE_INPUT_TEXT is
// commented out and no map in DirectivesChatbotPlug references this class, so
// nothing constructs or executes it today. Its signature was the last
// `execute(directive, pipeline, callback)` in the codebase; it is normalised
// here to the `execute(directive, callback)` shape shared by every other
// directive. The message it mutates is taken from the context (the same
// message object the plug puts in `context.message`) instead of from the
// pipeline argument that the generic dispatch never passed.
class DirDisableInputText extends BaseDirective {

  constructor(context) {
    super(context);
  }

  execute(directive, callback) {
    winston.verbose("Execute DisableInputText directive");
    let message = this.context.message;
    if (!message.attributes) {
      message.attributes = {}
    }
    message.attributes.disableInputMessage = true;
    callback();
  }
}

module.exports = { DirDisableInputText };
