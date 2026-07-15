const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const API_ENDPOINT = process.env.API_ENDPOINT;

class DataTablesService {

  constructor() { }

  /**
   * GET /{projectId}/tables/{tableId}/rows/list
   * @param {string} projectId
   * @param {string} tableId
   * @param {string} token
   * @param {object} [options]
   * @param {'all'|'any'} [options.must_match]
   * @param {'all'|'any'} [options.match] - alias di must_match
   * @param {Array<{column: string, operator: string, value?: *}>} [options.conditions]
   */
  async listRows(projectId, tableId, token, options = {}) {
    return new Promise((resolve, reject) => {
      const params = {};
      if (options.must_match) {
        params.must_match = options.must_match;
      }
      if (options.match) {
        params.match = options.match;
      }
      if (options.conditions && options.conditions.length > 0) {
        params.conditions = JSON.stringify(options.conditions);
      }

      const http_request = {
        url: `${API_ENDPOINT}/${projectId}/tables/${tableId}/rows/list`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        params,
        method: 'GET'
      };
      winston.debug('DataTablesService listRows', http_request);

      httpUtils.request(http_request, (err, response) => {
        if (err) {
          winston.error('DataTablesService listRows error:', err?.response?.data || err);
          reject(err);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * POST /{projectId}/tables/{tableId}/row/insert
   * @param {string} projectId
   * @param {string} tableId
   * @param {string} token
   * @param {{ data: object, id_row?: string }} body
   */
  async insertRow(projectId, tableId, token, body) {
    return new Promise((resolve, reject) => {
      const http_request = {
        url: `${API_ENDPOINT}/${projectId}/tables/${tableId}/row/insert`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        json: body,
        method: 'POST'
      };
      winston.debug('DataTablesService insertRow', http_request);

      httpUtils.request(http_request, (err, response) => {
        if (err) {
          winston.error('DataTablesService insertRow error:', err?.response?.data || err);
          reject(err);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * PUT /{projectId}/tables/{tableId}/row/update
   * @param {string} projectId
   * @param {string} tableId
   * @param {string} token
   * @param {{ id_row?: string, must_match?: string, match?: string, conditions?: Array, data: object }} body
   */
  async updateRow(projectId, tableId, token, body) {
    return new Promise((resolve, reject) => {
      const http_request = {
        url: `${API_ENDPOINT}/${projectId}/tables/${tableId}/row/update`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        json: body,
        method: 'PUT'
      };
      winston.debug('DataTablesService updateRow', http_request);

      httpUtils.request(http_request, (err, response) => {
        if (err) {
          winston.error('DataTablesService updateRow error:', err?.response?.data || err);
          reject(err);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * PUT /{projectId}/tables/{tableId}/row/upsert
   * @param {string} projectId
   * @param {string} tableId
   * @param {string} token
   * @param {{ id_row?: string, must_match?: string, match?: string, conditions?: Array, data: object, multi?: boolean }} body
   */
  async upsertRow(projectId, tableId, token, body) {
    return new Promise((resolve, reject) => {
      const http_request = {
        url: `${API_ENDPOINT}/${projectId}/tables/${tableId}/row/upsert`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        json: body,
        method: 'PUT'
      };
      winston.debug('DataTablesService upsertRow', http_request);

      httpUtils.request(http_request, (err, response) => {
        if (err) {
          winston.error('DataTablesService upsertRow error:', err?.response?.data || err);
          reject(err);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * PUT /{projectId}/tables/{tableId}/row/delete
   * @param {string} projectId
   * @param {string} tableId
   * @param {string} token
   * @param {{ id_row?: string, must_match?: string, match?: string, conditions?: Array }} body
   */
  async deleteRow(projectId, tableId, token, body) {
    return new Promise((resolve, reject) => {
      const http_request = {
        url: `${API_ENDPOINT}/${projectId}/tables/${tableId}/row/delete`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        json: body,
        method: 'PUT'
      };
      winston.debug('DataTablesService deleteRow', http_request);

      httpUtils.request(http_request, (err, response) => {
        if (err) {
          winston.error('DataTablesService deleteRow error:', err?.response?.data || err);
          reject(err);
        } else {
          resolve(response);
        }
      });
    });
  }
}

const dataTablesService = new DataTablesService();
module.exports = dataTablesService;
