const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');

// resources counted against the tokens quota of the legacy endpoints, with the Tiledesk key only
const LEGACY_QUOTA_RESOURCES = ['llm', 'ocr_llm'];

function modelName(model) {
  if (typeof model === 'string') {
    return model;
  }
  return model && typeof model.name === 'string' ? model.name : undefined;
}

function number(value) {
  const n = Number(value);
  return value !== undefined && value !== null && value !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Usage of the AI actions whatever the plan of the project: the server reads the plan and checks or counts the
 * tokens quota, or checks or charges the credits (POST /:project/usage/check, POST /:project/usage).
 * A server without these routes answers 404: the legacy tokens quota routes are used.
 *
 * usage: { resource = 'llm', provider, model, own_key, units } for check, plus input_tokens, output_tokens,
 * tokens, ref, key for report. own_key is true when the call uses a key of the project.
 */
class UsageService {

  /**
   * { ok: true, metering, managed? } when the operation can run, { ok: false, metering, error_code, error }
   * otherwise. A failed check lets the operation run.
   */
  async check(id_project, token, usage) {
    const body = this.#body(usage);
    try {
      const resbody = await this.#post(id_project, token, '/usage/check', body);
      if (resbody && resbody.ok === false) {
        return this.#refusal(resbody);
      }
      return Object.assign({ ok: true }, resbody && typeof resbody === 'object' ? resbody : {});
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403 && err.response.data) {
        return this.#refusal(err.response.data);
      }
      if (status === 404) {
        return this.#legacyCheck(id_project, token, body);
      }
      winston.error("(UsageService) usage check failed, operation allowed: " + (err?.message || err));
      return { ok: true };
    }
  }

  /**
   * Counts or charges the usage of an operation that already ran. Never rejects.
   */
  async report(id_project, token, usage) {
    const body = this.#body(usage);
    for (const name of ['input_tokens', 'output_tokens', 'tokens']) {
      const value = number(usage && usage[name]);
      if (value !== undefined) {
        body[name] = value;
      }
    }
    if (usage && usage.ref) {
      body.ref = String(usage.ref);
    }
    if (usage && usage.key) {
      body.key = String(usage.key);
    }
    try {
      return await this.#post(id_project, token, '/usage', body);
    } catch (err) {
      if (err?.response?.status === 404) {
        return this.#legacyReport(id_project, token, body);
      }
      winston.error("(UsageService) usage report failed: " + (err?.message || err));
      return null;
    }
  }

  /**
   * The OpenRouter model of a check that serves a credits project without its own key, with the Tiledesk
   * OpenRouter key of this service; null when there is none (the caller keeps the shared OpenAI key, if any).
   */
  managedModel(checkResult) {
    if (!checkResult || !checkResult.managed || !process.env.OPENROUTER_MANAGED_KEY) {
      return null;
    }
    return Object.assign({}, checkResult.managed, { api_key: process.env.OPENROUTER_MANAGED_KEY });
  }

  /**
   * Text of a refusal for flowError: the tokens quota, or the reason given by the credits.
   */
  refusalMessage(checkResult) {
    if (checkResult && checkResult.metering === 'credits' && checkResult.error) {
      return checkResult.error;
    }
    return "tokens quota exceeded";
  }

  #body(usage) {
    const data = usage || {};
    const body = {
      resource: data.resource || 'llm',
      own_key: data.own_key === true
    };
    if (data.provider) {
      body.provider = data.provider;
    }
    // only the name: the model objects carry the provider keys
    const name = modelName(data.model);
    if (name) {
      body.model = name;
    }
    if (data.units !== undefined) {
      body.units = data.units;
    }
    return body;
  }

  #refusal(data) {
    return {
      ok: false,
      metering: data.metering,
      error_code: data.error_code,
      error: data.error || data.message
    };
  }

  async #legacyCheck(id_project, token, body) {
    if (!LEGACY_QUOTA_RESOURCES.includes(body.resource) || body.own_key) {
      return { ok: true, metering: 'quotes' };
    }
    try {
      const resbody = await this.#request({
        url: process.env.API_ENDPOINT + "/" + id_project + "/quotes/tokens",
        headers: { 'Content-Type': 'application/json', 'Authorization': 'JWT ' + token },
        method: "GET"
      });
      if (resbody && resbody.isAvailable === false) {
        return { ok: false, metering: 'quotes', error_code: 13001, error: "Tokens quota exceeded" };
      }
    } catch (err) {
      winston.error("(UsageService) tokens quota check failed, operation allowed: " + (err?.message || err));
    }
    return { ok: true, metering: 'quotes' };
  }

  async #legacyReport(id_project, token, body) {
    if (!LEGACY_QUOTA_RESOURCES.includes(body.resource)) {
      winston.warn("(UsageService) the server has no usage API: " + body.resource + " not counted for project " + id_project);
      return null;
    }
    if (body.own_key) {
      return null;
    }
    const tokens = body.tokens !== undefined ? body.tokens : (body.input_tokens || 0) + (body.output_tokens || 0);
    try {
      return await this.#request({
        url: process.env.API_ENDPOINT + "/" + id_project + "/quotes/incr/tokens",
        headers: { 'Content-Type': 'application/json', 'Authorization': 'JWT ' + token },
        json: { tokens, model: body.model },
        method: "POST"
      });
    } catch (err) {
      winston.error("(UsageService) tokens quota increment failed: " + (err?.message || err));
      return null;
    }
  }

  #post(id_project, token, path, body) {
    return this.#request({
      url: process.env.API_ENDPOINT + "/" + id_project + path,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'JWT ' + token },
      json: body,
      method: "POST"
    });
  }

  #request(options) {
    return new Promise((resolve, reject) => {
      httpUtils.request(options, (err, resbody) => err ? reject(err) : resolve(resbody));
    });
  }
}

const usageService = new UsageService();
module.exports = usageService;
