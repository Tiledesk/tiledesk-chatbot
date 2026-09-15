const { DirIntent } = require('./DirIntent');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');
const httpUtils = require('../../utils/HttpUtils');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');

const SEPARATORS = /[,;\n]/;
const SINGLE_PLACEHOLDER = /^\{\{\s*([\w.]+)\s*\}\}$/;
const AUTOMATION_PREFIX = 'automation-request-';

class DirInviteHuman {

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
    winston.verbose("Execute InviteHuman directive");
    if (!directive || !directive.action) {
      this.logger.error("[Invite Human] Incorrect action for ", directive?.name, directive);
      winston.warn("(DirInviteHuman) Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(directive.action, (stop) => {
      callback(stop);
    });
  }

  async go(action, callback) {
    const trueIntent = action.trueIntent;
    const falseIntent = action.falseIntent;

    if (!trueIntent && !falseIntent) {
      this.logger.error("[Invite Human] missing both action.trueIntent & action.falseIntent");
      winston.error("(DirInviteHuman) missing both action.trueIntent & action.falseIntent");
      callback();
      return;
    }

    if (this.requestId && this.requestId.startsWith(AUTOMATION_PREFIX)) {
      this.logger.error("[Invite Human] requires a conversation");
      await this.setParameter("flowError", "(Invite human) requires a conversation");
      this.jump(falseIntent, action.falseIntentAttributes, callback);
      return;
    }

    let members = [];
    try {
      const variables = this.tdcache ? await TiledeskChatbot.allParametersStatic(this.tdcache, this.requestId) : {};
      members = DirInviteHuman.resolveMembers(action.members, variables, new Filler());
    } catch (err) {
      winston.error("(DirInviteHuman) error resolving members: " + JSON.stringify(DirInviteHuman.errorSummary(err)));
    }

    let result;
    try {
      result = await this.invite({ department_id: action.departmentId || undefined, members: members });
    } catch (err) {
      const summary = DirInviteHuman.errorSummary(err);
      this.logger.error("[Invite Human] Error: " + summary.message);
      winston.error("(DirInviteHuman) invite error: " + JSON.stringify(summary));
      await this.setParameter("flowError", "(Invite human) An error occurred: " + summary.message);
      this.jump(falseIntent, action.falseIntentAttributes, callback);
      return;
    }

    const invited = (result && Array.isArray(result.invited)) ? result.invited : [];
    await this.setParameter("invited_humans", invited);
    await this.setParameter("invited_humans_count", invited.length);

    if (invited.length > 0) {
      this.logger.native("[Invite Human] Invited: " + invited.map((i) => i.fullname || i.id_user).join(', '));
      this.jump(trueIntent, action.trueIntentAttributes, callback);
    } else {
      this.logger.native("[Invite Human] No human available");
      this.jump(falseIntent, action.falseIntentAttributes, callback);
    }
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
      winston.error("(DirInviteHuman) error setting parameter " + name + ": " + JSON.stringify(DirInviteHuman.errorSummary(err)));
    }
  }

  invite(body) {
    return new Promise((resolve, reject) => {
      const HTTPREQUEST = {
        url: `${this.API_ENDPOINT}/${this.projectId}/requests/${this.requestId}/participants/invite`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': DirInviteHuman.fixToken(this.token)
        },
        json: body,
        method: 'POST'
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

  /**
   * Resolves the "members" field of the action into a list of ids/emails.
   * A token that is exactly one {{variable}} is replaced by the raw variable value
   * (arrays are expanded); other tokens containing {{...}} are rendered with the Filler.
   */
  static resolveMembers(rawMembers, variables, filler) {
    const vars = variables || {};
    const result = [];

    const push = (value) => {
      if (value === undefined || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(push);
        return;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              parsed.forEach(push);
              return;
            }
          } catch (err) {
            // not a JSON array: treat as plain text
          }
        }
        trimmed.split(SEPARATORS).map((s) => s.trim()).filter((s) => s.length > 0).forEach((s) => {
          if (!result.includes(s)) {
            result.push(s);
          }
        });
        return;
      }
      push(String(value));
    };

    if (rawMembers === undefined || rawMembers === null) {
      return result;
    }
    const tokens = Array.isArray(rawMembers) ? rawMembers : String(rawMembers).split(SEPARATORS);
    for (const token of tokens) {
      if (typeof token !== 'string') {
        push(token);
        continue;
      }
      const trimmed = token.trim();
      if (!trimmed) {
        continue;
      }
      const placeholder = trimmed.match(SINGLE_PLACEHOLDER);
      if (placeholder) {
        push(DirInviteHuman.lookup(vars, placeholder[1]));
      } else if (trimmed.includes('{{') && filler) {
        push(filler.fill(trimmed, Object.assign({}, vars)));
      } else {
        push(trimmed);
      }
    }
    return result;
  }

  static lookup(variables, path) {
    return path.split('.').reduce((obj, key) => (obj !== undefined && obj !== null ? obj[key] : undefined), variables);
  }

  static fixToken(token) {
    if (!token) {
      return token;
    }
    return token.startsWith('JWT ') ? token : 'JWT ' + token;
  }

  /**
   * Reduces an axios-like error to a plain, log-safe summary.
   * Never reads err.config, err.request or headers (they may carry the bot JWT).
   */
  static errorSummary(err) {
    const responseData = (err && err.response) ? err.response.data : undefined;
    let message;
    if (responseData && typeof responseData.error === 'string' && responseData.error.length > 0) {
      message = responseData.error;
    } else if (err && err.message) {
      message = err.message;
    } else {
      message = String(err);
    }
    return {
      message: message,
      status: (err && err.response) ? err.response.status : undefined,
      data: responseData
    };
  }
}

module.exports = { DirInviteHuman };
