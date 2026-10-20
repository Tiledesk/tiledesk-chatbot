const { DirIntent } = require('./DirIntent');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { DirInviteHuman } = require('./DirInviteHuman');
const httpUtils = require('../../utils/HttpUtils');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');

class DirRemoveHuman {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.requestId = context.requestId;
    this.projectId = context.projectId;
    this.token = context.token;
    this.tdcache = context.tdcache;
    this.API_ENDPOINT = context.API_ENDPOINT;
    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.verbose("Execute RemoveHuman directive");
    let called = false;
    const safeCallback = (stop) => {
      if (called) {
        return;
      }
      called = true;
      callback(stop);
    };
    if (!directive || !directive.action) {
      this.logger.error("[Remove Human] Incorrect action for ", directive?.name, directive);
      winston.warn("(DirRemoveHuman) Incorrect directive: ", directive);
      safeCallback();
      return;
    }
    this.go(directive.action, (stop) => {
      safeCallback(stop);
    }).catch((err) => {
      winston.error("(DirRemoveHuman) unexpected error: " + JSON.stringify(DirInviteHuman.errorSummary(err)));
      safeCallback();
    });
  }

  async go(action, callback) {
    const trueIntent = action.trueIntent;
    const falseIntent = action.falseIntent;

    if (this.requestId && this.requestId.startsWith(DirInviteHuman.AUTOMATION_PREFIX)) {
      this.logger.error("[Remove Human] requires a conversation");
      await this.setParameter("flowError", "(Remove human) requires a conversation");
      this.jump(falseIntent, action.falseIntentAttributes, callback);
      return;
    }

    let result;
    try {
      result = await this.remove({ scope: DirRemoveHuman.normalizeScope(action.scope) });
    } catch (err) {
      const summary = DirInviteHuman.errorSummary(err);
      this.logger.error("[Remove Human] Error: " + summary.message);
      winston.error("(DirRemoveHuman) remove error: " + JSON.stringify(summary));
      await this.setParameter("flowError", "(Remove human) An error occurred: " + summary.message);
      this.jump(falseIntent, action.falseIntentAttributes, callback);
      return;
    }

    const removed = (result && Array.isArray(result.removed)) ? result.removed : [];
    await this.setParameter("removed_humans", removed);
    await this.setParameter("removed_humans_count", removed.length);
    this.logger.native("[Remove Human] Removed: " + (removed.length > 0 ? removed.map((r) => r.fullname || r.id_user).join(', ') : 'nobody'));
    this.jump(trueIntent, action.trueIntentAttributes, callback);
  }

  jump(intent, attributes, callback) {
    if (!intent) {
      callback();
      return;
    }
    const intentDirective = DirIntent.intentDirectiveFor(intent, attributes);
    this.intentDir.execute(intentDirective, () => {
      callback(true);
    });
  }

  async setParameter(name, value) {
    try {
      if (this.chatbot) {
        await this.chatbot.addParameter(name, value);
      } else if (this.tdcache) {
        await TiledeskChatbot.addParameterStatic(this.tdcache, this.requestId, name, value);
      }
    } catch (err) {
      winston.error("(DirRemoveHuman) error setting parameter " + name + ": " + JSON.stringify(DirInviteHuman.errorSummary(err)));
    }
  }

  remove(body) {
    return new Promise((resolve, reject) => {
      const HTTPREQUEST = {
        url: `${this.API_ENDPOINT}/${this.projectId}/requests/${this.requestId}/participants/remove`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': DirInviteHuman.fixToken(this.token)
        },
        json: body,
        method: 'POST',
        timeout: DirInviteHuman.INVITE_TIMEOUT_MS
      };
      httpUtils.request(HTTPREQUEST, (err, resbody) => {
        if (err) {
          reject(err);
        } else {
          resolve(resbody);
        }
      });
    });
  }

  static normalizeScope(scope) {
    return scope === 'all_humans' ? 'all_humans' : 'invited';
  }
}

module.exports = { DirRemoveHuman };
