const axios = require('axios');

const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const { TiledeskRequestVariables } = require('../TiledeskRequestVariables');

class DirCodeV2 {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action
      action._timeout = 60000;  // must be evaluated where to put
      action._language = 'JavaScript';  // must be evaluated where to put
      action._contextId = '<TBD>';  // must be evaluated where to put
    }
    else {
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });

  }

  async go(action, callback) {
    // console.log("action.source:", action.source);
    const source_code = action.source;
    if (!source_code || source_code.trim() === "") {
      if (this.log) { console.log("Invalid source_code"); }
      callback();
      return;
    }

    let attributes = null;
    if (this.tdcache) {
      attributes =
        await TiledeskChatbot.allParametersStatic(
          this.tdcache, this.requestId
        );
      if (this.log) { console.log("Attributes:", JSON.stringify(attributes)) }
    }
    else {
      console.error("(DirCode) No this.context.tdcache");
      callback();
      return;
    }

    let variablesManager = new TiledeskRequestVariables(this.requestId, this.tdcache, attributes);
    try {
      const dto = {
        runnerId: variablesManager.requestId,
        contextId: action._contextId,
        env: attributes,
        language: action._language,
        code: [
          action.source
        ],
        timeout: action._timeout,
      }

      const response = await axios.create({ baseURL: process.env.CODE_RUUNER_BASEURL, timeout: dto.timeout + 10000 })
        .post(process.env.CODE_RUUNER_ENDPOINT, dto);
      console.log('Response data:', response.data);

      for (const [key, value] of Object.entries(response.data.ops.set)) {
        await TiledeskChatbot.addParameterStatic(this.tdcache, this.requestId, key, value);
      }

      for (const [key, value] of Object.entries(response.data.ops.del)) {
        await variablesManager.delete(key);
      }

    }
    catch (err) {
      console.error("An error occurred:", err);
    }
    callback();
    return;
  }

}

module.exports = { DirCodeV2 };