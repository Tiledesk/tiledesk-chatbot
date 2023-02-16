const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { Filler } = require('../Filler');

class DirSetAttribute {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action
    }
    else {
      callback();
      return;
    }
    // console.log("go DirAssign with action:", action);
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    const expression = action.expression;
    const assignTo = action.assignTo;
    if (assignTo === null || expression === null) {
      if (this.log) {console.error("(DirSetAttribute) Invalid expression or assignTo parameters");}
      callback();
      return;
    }
    if (this.context.tdcache) {
      if (this.log) {console.log("(DirSetAttribute) this.requestId:", this.context.requestId);}
      let attributes =
        await TiledeskChatbot.allParametersStatic(
          this.context.tdcache, this.context.requestId);
      // filling
      let attributeValue;
      const filler = new Filler();
      attributeValue = filler.fill(expression, attributes);
      if (this.log) {console.log("(DirSetAttribute) Attributes:", JSON.stringify(attributes));}
      await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, assignTo, attributeValue);
      if (this.log) {
        console.log("(DirSetAttribute) Assigned:", assignTo, "=", attributeValue);
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          const value_type = typeof value;
          if (this.log) {console.log("(DirSetAttribute) request parameter:", key, "value:", value, "type:", value_type)}
        }
      }
      callback();
    }
    else {
      console.error("(DirSetAttribute) No cache! Skipping action.");
      callback();
    }
  }

}

module.exports = { DirSetAttribute };