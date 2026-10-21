const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');
const { DirIntent } = require("./DirIntent");
const winston = require('../../utils/winston');
const httpUtils = require("../../utils/HttpUtils");
const { Logger } = require("../../Logger");
const aiController = require("../../services/AIController");

const JOB_TIMEOUT_MS = 10 * 60 * 1000;

class DirDocparseExtract {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.projectId = this.context.projectId;
    this.token = this.context.token;

    this.intentDir = new DirIntent(context);
    this.jobTimeoutMs = JOB_TIMEOUT_MS;
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    console.log("DirDocparseExtract directive: ", directive);
    winston.debug("DirDocparseExtract directive: ", directive);
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.debug("DirDocparseExtract Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Docparse Extract] Executed");
      callback(stop);
    }).catch((err) => {
      winston.error("DirDocparseExtract unhandled error: ", err);
      callback();
    });
  }

  async go(action, callback) {
    console.log("DirDocparseExtract action: ", action);
    winston.debug("DirDocparseExtract action:", action);
    let finished = false;
    const done = (stop) => {
      if (finished) {
        return;
      }
      finished = true;
      callback(stop);
    };

    try {
      if (!this.tdcache) {
        winston.error("DirDocparseExtract Error: tdcache is mandatory");
        done();
        return;
      }

      const trueIntent = action.trueIntent;
      const falseIntent = action.falseIntent;
      const trueIntentAttributes = action.trueIntentAttributes;
      const falseIntentAttributes = action.falseIntentAttributes;

      const requestVariables = await TiledeskChatbot.allParametersStatic(this.tdcache, this.requestId);
      const filler = new Filler();
      const url = filler.fill(action.url, requestVariables);
      const filename = filler.fill(action.filename, requestVariables) || this.#filenameFromUrl(url);
      const mode = filler.fill(action.mode, requestVariables) || "text";

      if (!filename || !url) {
        const missing = !filename ? "filename" : "url";
        await this.#fail(action, `missing attribute '${missing}'`, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, done);
        return;
      }

      const base = process.env.DOCPARSE_ENDPOINT;
      if (!base) {
        await this.#fail(action, "DOCPARSE_ENDPOINT is undefined", trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, done);
        return;
      }

      const body = {
        filename: filename,
        url: url,
        mode: mode
      };

      const language = filler.fill(action.language, requestVariables);
      if (language) {
        body.language = language;
      }

      const dpi = this.#dpi(filler.fill(action.dpi, requestVariables));
      if (dpi) {
        body.dpi = dpi;
      }

      const fallback = await this.#resolveFallback(action, filler, requestVariables);
      if (fallback) {
        body.enable_vision_fallback = true;
        body.provider = fallback.provider;
        body.model = fallback.model;
        if (fallback.api_key) {
          body.api_key = fallback.api_key;
        }
        if (fallback.base_url) {
          body.base_url = fallback.base_url;
        }
      }

      console.log("DirDocparseExtract body: ", body);
      let created;
      try {
        created = await this.#request({
          url: this.#endpoint(base, "/v1/jobs/extract"),
          headers: { 'Content-Type': 'application/json' },
          json: body,
          method: "POST"
        });
      } catch (err) {
        winston.error("DirDocparseExtract submit error: ", this.#httpErrorLog(err));
        await this.#fail(action, this.#httpErrorMessage(err), trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, done);
        return;
      }

      console.log("DirDocparseExtract created: ", created);
      const jobId = created && created.job_id;
      if (!jobId) {
        await this.#fail(action, "docparse did not return a job_id", trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, done);
        return;
      }

      winston.verbose("DirDocparseExtract job queued: " + jobId);
      const outcome = await this.#waitForJob(base, jobId);
      if (!outcome.ok) {
        await this.#fail(action, outcome.error, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, done);
        return;
      }

      await this.#assignAttributes(action, outcome.text);
      if (trueIntent) {
        await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        done(true);
        return;
      }
      done();
    } catch (err) {
      winston.error("DirDocparseExtract error: ", err);
      const message = err && err.message ? err.message : "docparse extract failed";
      try {
        await this.#fail(action, message, action.trueIntent, action.trueIntentAttributes, action.falseIntent, action.falseIntentAttributes, done);
      } catch (failErr) {
        winston.error("DirDocparseExtract fail handler error: ", failErr);
        done();
      }
    }
  }

  async #resolveFallback(action, filler, requestVariables) {
    const provider = filler.fill(action.provider || action.llm, requestVariables);
    const model = filler.fill(action.model, requestVariables);
    if (!provider && !model) {
      return null;
    }
    if (!provider || !model) {
      throw new Error(!provider ? "missing attribute 'provider'" : "missing attribute 'model'");
    }

    const llmServer = filler.fill(action.llmServer || action.vllmServer, requestVariables);
    let resolved;
    try {
      resolved = await aiController.resolveLLMConfig(this.projectId, provider, model, this.token, llmServer);
    } catch (err) {
      const detail = err && (err.error || err.message) ? (err.error || err.message) : "unable to resolve fallback model";
      throw new Error(detail);
    }

    let apiKey = resolved && resolved.api_key;
    if (!apiKey && provider === "openai") {
      apiKey = process.env.GPTKEY;
    }

    return {
      provider: provider,
      model: (resolved && resolved.name) || model,
      api_key: apiKey || undefined,
      base_url: resolved && resolved.url ? resolved.url : undefined
    };
  }

  #waitForJob(base, jobId) {
    const topic = `docparse:jobs:${jobId}:completed`;
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;

      const finish = (outcome) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        Promise.resolve(this.tdcache.unsubscribe(topic)).catch((err) => {
          winston.error("DirDocparseExtract unsubscribe error: ", err);
        }).finally(() => {
          resolve(outcome);
        });
      };

      const onMessage = async (message) => {
        const received = typeof message === "string" ? message : JSON.stringify(message);
        winston.info("(DirDocparseExtract) Redis message received on " + topic + ": " + received);
        if (settled) {
          return;
        }
        try {
          const outcome = await this.#readJob(base, jobId);
          if (!outcome || outcome.pending || settled) {
            return;
          }
          finish(outcome);
        } catch (err) {
          winston.error("DirDocparseExtract job fetch after redis event failed: ", this.#httpErrorLog(err));
          finish({ ok: false, error: this.#httpErrorMessage(err) });
        }
      };

      winston.info("(DirDocparseExtract) Subscribing to " + topic);
      this.tdcache.subscribe(topic, onMessage).then(async () => {
        winston.info("(DirDocparseExtract) Subscribed to " + topic);
        if (settled) {
          return;
        }
        timer = setTimeout(() => {
          finish({ ok: false, error: "Docparse extract timed out after 10 minutes" });
        }, this.jobTimeoutMs);

        try {
          const outcome = await this.#readJob(base, jobId);
          if (!outcome || outcome.pending || settled) {
            return;
          }
          finish(outcome);
        } catch (err) {
          winston.warn("DirDocparseExtract preventive job poll failed: ", this.#httpErrorMessage(err));
        }
      }).catch((err) => {
        winston.error("DirDocparseExtract subscribe error: ", err);
        settled = true;
        resolve({ ok: false, error: "Unable to subscribe to docparse job result" });
      });
    });
  }

  async #readJob(base, jobId) {
    const job = await this.#request({
      url: this.#endpoint(base, "/v1/jobs/" + encodeURIComponent(jobId)),
      headers: { 'Content-Type': 'application/json' },
      method: "GET"
    });
    return this.#interpret(job, true);
  }

  #interpret(payload, fromPoll) {
    if (!payload || typeof payload !== "object") {
      return fromPoll
        ? { pending: true }
        : { ok: false, error: "Unrecognized docparse job event" };
    }

    if (payload.status === "queued" || payload.status === "running") {
      return { pending: true };
    }
    if (payload.status === "succeeded") {
      return { ok: true, text: this.#textFromResult(payload.result) };
    }
    if (payload.status === "failed") {
      return { ok: false, error: this.#formatError(payload.error) };
    }
    if (payload.result && typeof payload.result === "object") {
      return { ok: true, text: this.#textFromResult(payload.result) };
    }

    if (Object.prototype.hasOwnProperty.call(payload, "body")) {
      return { ok: true, text: this.#textFromResult(payload) };
    }

    if (payload.code || (typeof payload.error === "string" && payload.detail)) {
      return { ok: false, error: this.#formatError(payload) };
    }

    return fromPoll
      ? { pending: true }
      : { ok: false, error: "Unrecognized docparse job event" };
  }

  #textFromResult(result) {
    if (!result) {
      return "";
    }
    const body = result.body;
    if (typeof body === "string") {
      return body;
    }
    if (body && typeof body === "object") {
      return body.text || "";
    }
    return "";
  }

  #formatError(err) {
    if (!err) {
      return "Docparse extract failed";
    }
    if (typeof err === "string") {
      return err;
    }
    const code = err.code || err.error || "processing_failed";
    const detail = err.detail || "";
    return detail ? `${code}: ${detail}` : String(code);
  }

  #dpi(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    const dpi = Number(value);
    if (!Number.isInteger(dpi) || dpi <= 0) {
      return null;
    }
    return dpi;
  }

  #filenameFromUrl(value) {
    if (!value) {
      return null;
    }
    try {
      const pathname = new URL(value).pathname;
      const filename = pathname.split("/").filter(Boolean).pop();
      return filename ? decodeURIComponent(filename) : null;
    } catch (err) {
      return null;
    }
  }

  #endpoint(base, path) {
    return String(base).replace(/\/+$/, "") + path;
  }

  #request(options) {
    return new Promise((resolve, reject) => {
      httpUtils.request(options, (err, body) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(body);
      });
    });
  }

  #httpErrorMessage(err) {
    const data = err && err.response && err.response.data;
    if (data && typeof data === "object") {
      return this.#formatError(data);
    }
    if (typeof data === "string" && data) {
      return data;
    }
    return (err && err.message) || "Docparse request failed";
  }

  #httpErrorLog(err) {
    return {
      status: err && err.response && err.response.status,
      data: err && err.response && err.response.data,
      message: err && err.message
    };
  }

  async #fail(action, message, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, callback) {
    this.logger.error("[Docparse Extract] " + message);
    await this.chatbot.addParameter("flowError", "DocparseExtract Error: " + message);
    await this.#assignAttributes(action, "");
    if (falseIntent) {
      await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
      callback(true);
      return;
    }
    callback();
  }

  async #assignAttributes(action, text) {
    if (this.context.tdcache && action.assignReplyTo) {
      await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignReplyTo, text == null ? "" : text);
    }
  }

  async #executeCondition(result, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, callback) {
    let trueIntentDirective = null;
    if (trueIntent) {
      trueIntentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
    }
    let falseIntentDirective = null;
    if (falseIntent) {
      falseIntentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
    }
    if (result === true) {
      if (trueIntentDirective) {
        this.intentDir.execute(trueIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else if (callback) {
        callback();
      }
    }
    else if (falseIntentDirective) {
      this.intentDir.execute(falseIntentDirective, () => {
        if (callback) {
          callback();
        }
      });
    }
    else if (callback) {
      callback();
    }
  }

}

module.exports = { DirDocparseExtract }
