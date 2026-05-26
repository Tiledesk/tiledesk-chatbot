const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { InternalSubAgentService } = require('../../services/InternalSubAgentService');
const { TiledeskChatbotConst } = require('../../engine/TiledeskChatbotConst');
const { Logger } = require('../../Logger');
const winston = require('../../utils/winston');

class DirReturn {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.projectId = context.projectId;
    this.requestId = context.requestId;
    this.token = context.token;
    this.tdcache = context.tdcache;
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    console.log("DirReturn execute");
    const action = directive.action;
    if (!action) {
      this.logger.error('[Return] Incorrect action for ', directive.name, directive);
      callback();
      return;
    }

    this.go(action, () => {
      this.logger.native('[Return] Executed');
      callback();
    });
  }

  async go(action, callback) {
    console.log("DirReturn go");
    if (!this.tdcache) {
      winston.error('(DirReturn) tdcache is mandatory');
      callback();
      return;
    }

    const requestAttributes = await TiledeskChatbot.allParametersStatic(this.tdcache, this.requestId);
    const filler = new Filler();
    const filledStatus = filler.fill(action.status, requestAttributes);

    let payload;
    try {
      payload = await this.#resolvePayload(action, filler, requestAttributes);
    } catch (error) {
      winston.error('(DirReturn) Error building return payload: ', error);
      this.logger.error('[Return] Error building payload');
      callback();
      return;
    }

    const returnMessage = {
      status: filledStatus,
      payload: payload
    };

    this.logger.native('[Return] payload: ', returnMessage);

    const topic = InternalSubAgentService.webhookTopic(this.requestId);
    console.log("DirReturn topic: ", topic);
    const readyKey = TiledeskChatbotConst.redisWebhookReadyKey(this.requestId);
    console.log("DirReturn readyKey: ", readyKey);
    try {
      console.log("DirReturn publishing to topic: ", topic);
      await this.tdcache.publish(topic, JSON.stringify(returnMessage));
      console.log("DirReturn setting readyKey: ", readyKey);
      await this.tdcache.set(readyKey, '1', { EX: 120 });
      winston.verbose('(DirReturn) Published return to topic: ' + topic);
    } catch (error) {
      winston.error('(DirReturn) Error publishing return: ', error);
    }

    callback();
  }

  async #resolvePayload(action, filler, requestAttributes) {
    if (action.payload && action.bodyType === 'json') {
      const jsonBody = filler.fill(action.payload, requestAttributes);
      try {
        return JSON.parse(jsonBody);
      } catch (error) {
        winston.error('(DirReturn) Error parsing json payload: ' + jsonBody, error);
        this.logger.error('[Return] Error parsing json payload ', jsonBody);
        throw error;
      }
    }

    if (action.payload !== undefined && action.payload !== null) {
      return InternalSubAgentService.fillValue(action.payload, requestAttributes);
    }

    return null;
  }
}

module.exports = { DirReturn };
