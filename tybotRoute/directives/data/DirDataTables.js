const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../../variables/Filler");
const { DirIntent } = require("../flow/DirIntent");
const winston = require('../../utils/winston');
const { BaseDirective } = require("../BaseDirective");
const dataTablesService = require("../../services/DataTablesService");
const { Directives } = require('../Directives');

const SUPPORTED_OPERATIONS = ['get', 'insert', 'update', 'delete', 'upsert'];
const ROW_DOCUMENT_OPERATIONS = ['insert', 'update', 'delete', 'upsert'];

class DirDataTables extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.DATA_TABLES];

  _conditionLabels = {
    trueExecute: "[DataTables] executing true condition",
    falseExecute: "[DataTables] executing false condition"
  };

  constructor(context) {
    super(context);
    this.chatbot = context.chatbot;

    this.intentDir = new DirIntent(context);
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
      await this._assignAttributes(action, [['assignErrorTo', error, { onlyIfTruthy: true }]]);
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    if (!operation || !SUPPORTED_OPERATIONS.includes(operation)) {
      const error = `operation must be one of: ${SUPPORTED_OPERATIONS.join(', ')}`;
      this.logger.error("[DataTables] " + error);
      await this._assignAttributes(action, [['assignErrorTo', error, { onlyIfTruthy: true }]]);
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
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
      // the original #assignAttributes wrote assignResultTo only when the value was
      // neither undefined nor null - which is *not* the same as a truthiness guard.
      const normalizedResult = this.#normalizeResult(result, operation);
      await this._assignAttributes(action, normalizedResult === undefined || normalizedResult === null
        ? []
        : [['assignResultTo', normalizedResult]]);
      if (trueIntent) {
        await this._executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
    } catch (err) {
      const error = this.#extractError(err);
      this.logger.error("[DataTables] " + operation + " error: ", error);
      winston.error("DirDataTables error:", err?.response?.data || err);
      await this._assignAttributes(action, [['assignErrorTo', error, { onlyIfTruthy: true }]]);
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
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

}

module.exports = { DirDataTables };
