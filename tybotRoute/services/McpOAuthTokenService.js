const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const API_ENDPOINT = process.env.API_ENDPOINT;

// A cached token is dropped this long before it expires, so it is never sent expired.
const EXPIRY_MARGIN_MS = 60 * 1000;

/**
 * Access tokens of the MCP servers a project connected with OAuth2.
 *
 * The tokens live encrypted in tiledesk-server, which also refreshes them: they
 * are always asked to GET /:id_project/mcp/oauth/connections/:id/token with the
 * chatbot JWT, never read from the database. Tokens are kept in memory until
 * shortly before they expire and must never be logged.
 */
class McpOAuthTokenService {

  constructor() {
    // Instance fields so tests can substitute stubs.
    this.httpUtils = httpUtils;
    this.now = () => Date.now();
    this.cache = new Map();
  }

  clearCache() {
    this.cache.clear();
  }

  cacheKey(id_project, connection_id) {
    return id_project + ":" + connection_id;
  }

  getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (this.now() >= entry.valid_until) {
      this.cache.delete(key);
      return null;
    }
    return entry.token;
  }

  store(key, token) {
    if (!token.expires_at) {
      return;
    }
    const valid_until = new Date(token.expires_at).getTime() - EXPIRY_MARGIN_MS;
    if (isNaN(valid_until) || this.now() >= valid_until) {
      return;
    }
    this.cache.set(key, { token: token, valid_until: valid_until });
  }

  /**
   * Resolves { access_token, token_type, expires_at }. Rejects with err.status
   * (the server status, 502 when the server cannot be reached) and err.code
   * from the answer body ('needs_reauth' on 409).
   */
  async getToken(id_project, connection_id, token) {
    const key = this.cacheKey(id_project, connection_id);
    const cached = this.getCached(key);
    if (cached) {
      return cached;
    }

    const oauthToken = await this.requestToken(id_project, connection_id, token);
    this.store(key, oauthToken);
    return oauthToken;
  }

  requestToken(id_project, connection_id, token) {
    return new Promise((resolve, reject) => {

      const TOKEN_HTTPREQUEST = {
        url: API_ENDPOINT + "/" + id_project + "/mcp/oauth/connections/" + connection_id + "/token",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "GET"
      }
      winston.debug("McpOAuthTokenService: requesting the token of connection " + connection_id + " for project " + id_project);

      this.httpUtils.request(
        TOKEN_HTTPREQUEST, (err, body) => {
          if (err) {
            reject(this.toError(err, connection_id));
            return;
          }
          if (!body || typeof body.access_token !== 'string' || !body.access_token) {
            const error = new Error("MCP OAuth token response without access_token for connection " + connection_id);
            error.status = 502;
            reject(error);
            return;
          }
          resolve({
            access_token: body.access_token,
            token_type: body.token_type || 'Bearer',
            expires_at: body.expires_at || null
          });
        })
    })
  }

  toError(err, connection_id) {
    const response = err && err.response;
    const data = response && response.data;
    const error = new Error((data && data.error) || "MCP OAuth token unavailable for connection " + connection_id);
    error.status = (response && response.status) || 502;
    if (data && data.code) {
      error.code = data.code;
    }
    return error;
  }

}

const mcpOAuthTokenService = new McpOAuthTokenService();
module.exports = mcpOAuthTokenService;
