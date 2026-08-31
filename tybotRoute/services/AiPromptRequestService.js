const axios = require("axios").default;
const assert = require("assert");
const path = require("path");
const mime = require("mime-types");
const winston = require('../utils/winston');

/**
 * AiPromptRequestService
 *
 * The pure request/response shaping used by the AI Prompt directive: turning a
 * conversation transcript into the LLM chat_history_dict, building the
 * reasoning ("thinking") block, detecting an attachment's media type,
 * validating the mandatory action parameters, and normalising the MCP server
 * declarations that are forwarded to the LLM server.
 *
 * Extracted verbatim from tiledeskChatbotPlugs/directives/ai/DirAiPrompt.js
 * (Phase 6a). These functions never touched directive state (`this`), which is
 * exactly why they could be moved out of a quarantined file safely; the
 * stateful parts of the directive (go/execute, the cache and HTTP calls that
 * need this.tdcache / this.token / this.logger) were deliberately left behind.
 */

// Fields accepted by the LLM server schema. Everything else (id, native,
// customHeaders, oauth, tools, ...) is internal and must not be forwarded.
const SERVER_ALLOWED_FIELDS = ['transport', 'url', 'command', 'args', 'api_key', 'headers', 'parameters'];

async function checkMandatoryParameters(action) {
  return new Promise((resolve, reject) => {
    let params = ['question', 'llm', 'model']; // mandatory params
    params.forEach((p) => {
      if (!action[p]) {
        reject(p)
      }
    })
    resolve(true);
  })
}

/**
 * Transforms the transcirpt array in a dictionary like '0': { "question": "xxx", "answer":"xxx"}
 * merging consecutive messages with the same role in a single question or answer.
 * If the first message was sent from assistant, this will be deleted.
 */
async function transcriptToLLM(transcript) {
  
  let objectTranscript = {};

  if (transcript.length === 0) {
    return objectTranscript;
  }

  let mergedTranscript = [];
  let current = transcript[0];

  for (let i = 1; i < transcript.length; i++) {
    if (transcript[i].role === current.role) {
      current.content += '\n' + transcript[i].content;
    } else {
      mergedTranscript.push(current);
      current = transcript[i]
    }
  }
  mergedTranscript.push(current);

  if (mergedTranscript[0].role === 'assistant') {
    mergedTranscript.splice(0, 1)
  }

  let counter = 0;
  for (let i = 0; i < mergedTranscript.length - 1; i += 2) {
    // Check if [i] is role user and [i+1] is role assistant??
    assert(mergedTranscript[i].role === 'user');
    assert(mergedTranscript[i+1].role === 'assistant');

    if (!mergedTranscript[i].content.startsWith('/')) {
      objectTranscript[counter] = {
        question: mergedTranscript[i].content,
        answer: mergedTranscript[i+1].content
      }
      counter++;
    }
  }

  return objectTranscript;
}

/**
 * Builds the thinking object for reasoning based on the level and max_tokens
 * @param {string} level - The reasoning level: 'low', 'medium', or 'high'
 * @param {number} max_tokens - Maximum tokens available
 * @returns {object} The thinking configuration object
 */
function buildThinkingObject(level, max_tokens) {
  // Calculate budget_tokens based on level
  let budgetPercentage;
  switch (level) {
    case 'high':
      budgetPercentage = 0.60; // 60%
      break;
    case 'medium':
      budgetPercentage = 0.40; // 40%
      break;
    case 'low':
    default:
      budgetPercentage = 0.20; // 20%
      break;
  }

  const budget_tokens = Math.floor(max_tokens * budgetPercentage);

  return {
    show_thinking_stream: true,
    reasoning_effort: level,
    reasoning_summary: "auto",
    type: "enabled",
    budget_tokens: budget_tokens,
    thinkingBudget: budget_tokens,
    thinkingLevel: level
  };
}

function buildEnabledTools(server) {
  if (!Array.isArray(server?.tools) || server.tools.length === 0) {
    return [];
  }
  return server.tools
    .map(t => (typeof t === 'string' ? t : t?.name))
    .filter(name => typeof name === 'string' && name.length > 0);
}

function getIntegrationServer(integrationServers, server) {
  if (!Array.isArray(integrationServers) || !server) return null;
  if (server.id) {
    const byId = integrationServers.find(s => s.id === server.id);
    if (byId) return byId;
  }
  if (server.name) {
    return integrationServers.find(s => s.name === server.name) || null;
  }
  return null;
}

function enrichServersFromIntegration(servers, mcp_integration) {
  const integrationServers = mcp_integration?.value?.servers;
  if (!Array.isArray(servers) || !Array.isArray(integrationServers)) return;

  servers.forEach(server => {
    const integrationServer = getIntegrationServer(integrationServers, server);
    if (!integrationServer) return;

    if (server.native) {
      delete server.url;
    } else if (integrationServer.url) {
      server.url = integrationServer.url;
    }
    if (integrationServer.transport) {
      server.transport = integrationServer.transport;
    }
    if (integrationServer.authorization?.key) {
      server.api_key = integrationServer.authorization.key;
    }

    const integrationHeaders = customHeadersToObject(integrationServer.customHeaders);
    if (Object.keys(integrationHeaders).length > 0) {
      const existingHeaders =
        server.headers &&
        typeof server.headers === 'object' &&
        !Array.isArray(server.headers)
          ? server.headers
          : {};
      server.headers = { ...existingHeaders, ...integrationHeaders };
    }
  });
}

function customHeadersToObject(customHeaders) {
  if (!Array.isArray(customHeaders)) {
    return {};
  }
  return customHeaders.reduce((acc, header) => {
    if (header?.enabled === false || !header?.key) {
      return acc;
    }
    acc[header.key] = header.value != null ? String(header.value) : '';
    return acc;
  }, {});
}

function mergeHeadersWithVariables(existingHeaders, variables) {
  const base =
    existingHeaders &&
    typeof existingHeaders === 'object' &&
    !Array.isArray(existingHeaders)
      ? { ...existingHeaders }
      : {};
  for (const key of Object.keys(base)) {
    const v = base[key];
    if (v !== undefined && v !== null && typeof v !== 'string') {
      base[key] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
  }
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    return base;
  }
  for (const key of Object.keys(variables)) {
    try {
      const v = variables[key];
      if (v === undefined || typeof v === 'function') {
        continue;
      }
      if (v === null) {
        base[key] = '';
        continue;
      }
      base[key] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    } catch (err) {
      winston.warn("DirAiPrompt mergeHeadersWithVariables skip key:", key, err);
    }
  }
  return base;
}

async function detectAttach(source) {
  let mime_type;
  let type;

  const ext = path.extname(source);
  mime_type = mime.lookup(ext) || "application/octet-stream";

  if (mime_type === "application/octet-stream") {
    try {
      const res = await axios.head(source);
      if (res.headers["content-type"]) {
        mime_type = res.headers["content-type"];
      }
    } catch (err) {
      mime_type = "application/octet-stream";
    }
  }

  if (mime_type.startsWith("image/")) type = "image";
  else if (mime_type.startsWith("video/")) type = "video";
  else if (mime_type.startsWith("audio/")) type = "audio";
  else type = "file";

  return {
    type: type,
    source: source,
    mime_type: mime_type,
    detail: "auto"
  }

}

module.exports = {
  SERVER_ALLOWED_FIELDS,
  checkMandatoryParameters,
  transcriptToLLM,
  buildThinkingObject,
  buildEnabledTools,
  getIntegrationServer,
  enrichServersFromIntegration,
  customHeadersToObject,
  mergeHeadersWithVariables,
  detectAttach
};
