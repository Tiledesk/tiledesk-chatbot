const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
const winston = require('../../utils/winston');
const { Logger } = require("../../Logger");
const dataTablesService = require("../../services/DataTablesService");

const SUPPORTED_OPERATIONS = ['get', 'insert', 'update', 'delete', 'upsert'];
const ROW_DOCUMENT_OPERATIONS = ['insert', 'update', 'delete', 'upsert'];

class DirDataTables {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.projectId = context.projectId;
    this.token = context.token;
    this.API_ENDPOINT = context.API_ENDPOINT;

    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.debug("DirDataTables directive: ", directive);
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive);
      winston.debug("DirDataTables Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[DataTables] Executed");
      callback(stop);
    });
  }

  async go(action, callback) {
    winston.debug("DirDataTables action: ", action);
    if (!this.tdcache) {
      winston.error("DirDataTables Error: tdcache is mandatory");
      callback();
      return;
    }

    const trueIntent = action.trueIntent;
    const falseIntent = action.falseIntent;
    const trueIntentAttributes = action.trueIntentAttributes;
    const falseIntentAttributes = action.falseIntentAttributes;

    const requestVariables = await TiledeskChatbot.allParametersStatic(this.tdcache, this.requestId);
    const filler = new Filler();

    const tableId = filler.fill(action.tableId, requestVariables);
    const operation = action.operation;

    if (!tableId) {
      const error = "tableId is required";
      this.logger.error("[DataTables] " + error);
      await this.#assignAttributes(action, null, error);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    if (!operation || !SUPPORTED_OPERATIONS.includes(operation)) {
      const error = `operation must be one of: ${SUPPORTED_OPERATIONS.join(', ')}`;
      this.logger.error("[DataTables] " + error);
      await this.#assignAttributes(action, null, error);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    try {
      let result;
      switch (operation) {
        case 'get':
          result = await dataTablesService.listRows(this.projectId, tableId, this.token, {
            must_match: action.must_match,
            conditions: this.#fillConditions(action.conditions, filler, requestVariables)
          });
          break;
        case 'insert':
          result = await dataTablesService.insertRow(this.projectId, tableId, this.token, {
            data: this.#fillData(action.data, filler, requestVariables),
            ...(action.id_row ? { id_row: filler.fill(action.id_row, requestVariables) } : {})
          });
          break;
        case 'update':
          result = await dataTablesService.updateRow(this.projectId, tableId, this.token, this.#buildMutationBody(action, filler, requestVariables));
          break;
        case 'delete':
          result = await dataTablesService.deleteRow(this.projectId, tableId, this.token, this.#buildDeleteBody(action, filler, requestVariables));
          break;
        case 'upsert':
          result = await dataTablesService.upsertRow(this.projectId, tableId, this.token, {
            ...this.#buildMutationBody(action, filler, requestVariables),
            ...(action.multi !== undefined ? { multi: action.multi } : {})
          });
          break;
      }

      this.logger.native("[DataTables] operation " + operation + " completed");
      await this.#assignAttributes(action, this.#normalizeResult(result, operation), null);
      if (trueIntent) {
        await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
    } catch (err) {
      const error = this.#extractError(err);
      this.logger.error("[DataTables] " + operation + " error: ", error);
      winston.error("DirDataTables error:", err?.response?.data || err);
      await this.#assignAttributes(action, null, error);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
    }
  }

  #fillConditions(conditions, filler, requestVariables) {
    if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
      return undefined;
    }
    return conditions.map((condition) => {
      const filled = { ...condition };
      if (filled.value !== undefined && filled.value !== null) {
        filled.value = filler.fill(String(filled.value), requestVariables);
      }
      return filled;
    });
  }

  #fillData(data, filler, requestVariables) {
    if (!data || typeof data !== 'object') {
      return {};
    }
    const filled = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        filled[key] = value;
      } else if (typeof value === 'string') {
        filled[key] = filler.fill(value, requestVariables);
      } else {
        filled[key] = value;
      }
    }
    return filled;
  }

  #buildMutationBody(action, filler, requestVariables) {
    const body = {
      data: this.#fillData(action.data, filler, requestVariables)
    };
    if (action.id_row) {
      body.id_row = filler.fill(action.id_row, requestVariables);
    }
    if (action.must_match) {
      body.must_match = action.must_match;
    }
    const conditions = this.#fillConditions(action.conditions, filler, requestVariables);
    if (conditions) {
      body.conditions = conditions;
    }
    return body;
  }

  #buildDeleteBody(action, filler, requestVariables) {
    const body = {};
    if (action.id_row) {
      body.id_row = filler.fill(action.id_row, requestVariables);
    }
    if (action.must_match) {
      body.must_match = action.must_match;
    }
    const conditions = this.#fillConditions(action.conditions, filler, requestVariables);
    if (conditions) {
      body.conditions = conditions;
    }
    return body;
  }

  #normalizeResult(result, operation) {
    if (!ROW_DOCUMENT_OPERATIONS.includes(operation) || result === undefined || result === null) {
      return result;
    }
    if (Array.isArray(result)) {
      return result.map((row) => this.#extractRowData(row));
    }
    return this.#extractRowData(result);
  }

  #extractRowData(row) {
    if (row && row.data !== undefined && row.data !== null && typeof row.data === 'object' && !Array.isArray(row.data)) {
      return row.data;
    }
    return row;
  }

  #extractError(err) {
    if (err?.response?.data?.message) {
      return err.response.data.message;
    }
    if (err?.response?.data?.error) {
      return err.response.data.error;
    }
    if (err?.response?.data) {
      return typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data);
    }
    if (err?.message) {
      return err.message;
    }
    return String(err);
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
        this.logger.native("[DataTables] executing true condition");
        this.intentDir.execute(trueIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        winston.debug("DirDataTables No trueIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
    else {
      if (falseIntentDirective) {
        this.logger.native("[DataTables] executing false condition");
        this.intentDir.execute(falseIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        winston.debug("DirDataTables No falseIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
  }

  async #assignAttributes(action, result, error) {
    if (this.context.tdcache) {
      if (action.assignResultTo && result !== undefined && result !== null) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignResultTo, result);
      }
      if (action.assignErrorTo && error) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignErrorTo, error);
      }
    }
  }
}

module.exports = { DirDataTables };
