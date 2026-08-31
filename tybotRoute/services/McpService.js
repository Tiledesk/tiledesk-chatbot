const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');
const { apiEndpoint } = require('../config/endpoints');

/**
 * The native MCP servers endpoint.
 *
 *   GET /{projectId}/mcp/native
 *
 * Extracted from DirAiPrompt's `fetchNativeMcpServers()`. The RESPONSE BODY
 * IS DELIBERATELY IGNORED, exactly as before: the call is made for its side
 * effect - the server repopulates the `native_mcp:servers` cache entry, which
 * the directive then re-reads through tdcache. Only the error comes back, so
 * the directive can keep logging it through both its own Logger and winston.
 *
 * The url was built from the directive's `this.API_ENDPOINT`, which `startApp`
 * seeds from `endpoints.apiEndpoint()` - the same value this resolves.
 */
class McpService {

  constructor() { }

  /**
   * Ask the api to refresh the project's native MCP server list.
   *
   * @param {string} id_project
   * @param {string} token       raw JWT (sent as "JWT <token>")
   * @param {string} [caller]    log prefix, e.g. "DirAiPrompt"
   * @returns {Promise<{err: (Error|null)}>} never rejects
   */
  async fetchNativeServers(id_project, token, caller = "McpService") {
    return new Promise((resolve) => {
      const HTTPREQUEST = {
        url: apiEndpoint() + "/" + id_project + "/mcp/native",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        method: "GET"
      };
      winston.debug(caller + " fetch native MCP servers HttpRequest", HTTPREQUEST);

      httpUtils.request(HTTPREQUEST, (err) => {
        resolve({ err: err });
      });
    });
  }

}

const mcpService = new McpService();
module.exports = mcpService;
