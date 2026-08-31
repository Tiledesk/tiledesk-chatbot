const { TiledeskChatbot } = require("../../../engine/TiledeskChatbot");
const { Filler } = require("../../Filler");
const { DirIntent } = require("../flow/DirIntent");
const { TiledeskChatbotConst } = require("../../../engine/TiledeskChatbotConst");
const { TiledeskChatbotUtil } = require("../../../utils/TiledeskChatbotUtil");
require('dotenv').config();
const winston = require('../../../utils/winston');
const integrationService = require("../../../services/IntegrationService");
const mcpService = require("../../../services/McpService");
const { BaseDirective } = require("../../BaseDirective");
const quotasService = require("../../../services/QuotasService");
const llmKeyService = require("../../../services/LLMKeyService");
const llmAskService = require("../../../services/LlmAskService");
const { Directives } = require('../Directives');
const aiPromptRequestService = require("../../../services/AiPromptRequestService");

const NATIVE_MCP_CACHE_KEY = 'native_mcp:servers';
const reasoningLevels = ['low', 'medium', 'high'];


class DirAiPrompt extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.AI_PROMPT];

  _conditionLabels = {
    trueExecute: "[AI Prompt] executing true condition",
    trueMissing: "[AI Prompt] no block connected to true condition",
    falseExecute: "[AI Prompt] executing false condition",
    falseMissing: "[AI Prompt] no block connected to false condition"
  };

  constructor(context) {
    super(context);
    this.chatbot = this.context.chatbot;

    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
    winston.verbose("Execute AiPrompt directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.debug("DirAiPrompt Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[AI Prompt] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("DirAiPrompt action:", action);
    if (!this.tdcache) {
      winston.error("Error: DirAiPrompt tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;
    let transcript;
    let answer = "No answer"

    winston.debug("DirAskGPTV2 trueIntent", trueIntent)
    winston.debug("DirAskGPTV2 falseIntent", falseIntent)

    await this.checkMandatoryParameters(action).catch( async (missing_param) => {
      this.logger.error(`[AI Prompt] missing attribute '${missing_param}'`);
      await this.chatbot.addParameter("flowError", "AiPrompt Error: '" + missing_param + "' attribute is undefined");
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return Promise.reject();
      }
      callback();
      return Promise.reject();
    })

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    const filler = new Filler();
    const filled_question = filler.fill(action.question, requestVariables);
    const filled_context = filler.fill(action.context, requestVariables);
    const filled_model = filler.fill(action.model, requestVariables);
    
    if (action.history) {
      this.logger.native("[AI Prompt] using chat transcript");
      let transcript_string = await TiledeskChatbot.getParameterStatic(
        this.context.tdcache,
        this.context.requestId,
        TiledeskChatbotConst.REQ_TRANSCRIPT_KEY);
        winston.debug("DirAiPrompt transcript string: " + transcript_string)

      if (transcript_string) {
        transcript = TiledeskChatbotUtil.transcriptJSON(transcript_string);
        winston.debug("DirAiPrompt transcript: ", transcript)
      } else {
        this.logger.warn("[AI Prompt] no chat transcript found, skipping history translation");
        winston.verbose("DirAiPrompt transcript_string is undefined. Skip JSON translation for chat history")
      }
    }

    let key;
    let publicKey = false;
    let ollama_integration;
    let vllm_server_config;

    if (action.llm === 'ollama') {
      ollama_integration = await integrationService.getIntegration(this.projectId, action.llm, this.token).catch( async (err) => {
        this.logger.error("[AI Prompt] Error getting ollama integration.")
        winston.error("DirAiPrompt Error getting ollama integration: ", err);
        await this.chatbot.addParameter("flowError", "Ollama integration not found");
        if (falseIntent) {
          await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      });

    } else if (action.llm === 'vllm') {
      const vllm_integration = await integrationService.getIntegration(this.projectId, action.llm, this.token);
      
      if (!vllm_integration?.value) {
        this.logger.error("[AI Prompt] Error getting vllm integration.");
        winston.error("DirAiPrompt Error getting vllm integration");
        await this.chatbot.addParameter("flowError", "Vllm integration not found");
        if (falseIntent) {
          await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      }

      const vllm_value = vllm_integration.value;
      if (Array.isArray(vllm_value.servers)) {
        const filled_vllm_server = filler.fill(action.vllmServer, requestVariables);
        if (!filled_vllm_server) {
          this.logger.error("[AI Prompt] missing vllmServer for multi-server vllm integration");
          await this.chatbot.addParameter("flowError", "AiPrompt Error: 'vllmServer' attribute is undefined");
          if (falseIntent) {
            await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        }
        vllm_server_config = vllm_value.servers.find(s => s.name === filled_vllm_server);
        if (!vllm_server_config) {
          this.logger.error("[AI Prompt] vllm server not found: ", filled_vllm_server);
          await this.chatbot.addParameter("flowError", "AiPrompt Error: vllm server '" + filled_vllm_server + "' not found");
          if (falseIntent) {
            await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        }
        key = vllm_server_config.apikey;
      } else {
        key = vllm_value.apikey;
      }

      if (!key) {
        this.logger.error("[AI Prompt] llm key not found in vllm integration");
        winston.error("Error: DirAiPrompt llm key not found in vllm integration");
        await this.chatbot.addParameter("flowError", "AiPrompt Error: missing key for llm vllm");
        if (falseIntent) {
          await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      }

    } else {
      const resolved_key = await llmKeyService.resolveLlmKey(this.projectId, action.llm, this.token, {
        onPublicKey: () => {
          this.logger.native("[AI Prompt] Using shared OpenAI key.")
        }
      });
      key = resolved_key.key;
      publicKey = resolved_key.publicKey;

      if (!key) {
        this.logger.error("[AI Prompt] llm key not found in integrations");
        winston.error("Error: DirAiPrompt llm key not found in integrations");
        await this.chatbot.addParameter("flowError", "AiPrompt Error: missing key for llm " + action.llm);
        if (falseIntent) {
          await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      }
    }

    if (publicKey === true) {
      try {
        let keep_going = await quotasService.checkQuoteAvailability(this.projectId, this.token)
        if (keep_going === false) {
          this.logger.warn("[AI Prompt] OpenAI tokens quota exceeded");
          await this.chatbot.addParameter("flowError", "GPT Error: tokens quota exceeded");
          if (falseIntent) {
            await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback();
            return;
          }
          callback();
          return;
        }
      } catch (err) {
        this.logger.error("An error occured on checking token quota availability");
        await this.chatbot.addParameter("flowError", "An error occured on checking token quota availability");
        if (falseIntent) {
          await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback();
          return;
        }
        callback();
        return;
      }
    }

    let json = {
      question: filled_question,
      llm: action.llm,
      model: filled_model,
      llm_key: key,
      temperature: action.temperature,
      max_tokens: action.max_tokens,
      id_project: this.projectId,
      request_id: this.requestId,
      agent_id: this.chatbot?.bot.root_id || null
    }

    if (action.context) {
      json.system_context = filled_context;
    }
    if (transcript) {
      json.chat_history_dict = await this.transcriptToLLM(transcript);
    }

    if (action.llm === 'ollama') {
      json.llm_key = "";
      json.model = {
        name: action.model,
        url: ollama_integration.value.url,
        token: ollama_integration.value.token
      }
      json.stream = false

    }

    if (action.llm === 'vllm' && vllm_server_config) {
      console.log("llm: vllm")
      json.model = {
        name: filled_model,
        url: vllm_server_config.url,
        api_key: vllm_server_config.apikey || vllm_server_config.token || null,
        provider: 'vllm'
      }
      console.log("set json.model to: ", json.model);
    }

    if (action.attach) {
      json.attach = await this.detectAttach(action.attach);
    }

    if (action.servers) {

      let mcp_integration;
      try {
        mcp_integration = await integrationService.getIntegration(this.projectId, "mcp", this.token);
        if (mcp_integration?.value?.servers) {
          this.enrichServersFromIntegration(action.servers, mcp_integration);
        }

      } catch (err) {
        this.logger.error("[AI Prompt] Error getting mcp integration: ", err);
        winston.error("DirAiPrompt Error getting mcp integration: ", err);
        await this.chatbot.addParameter("flowError", "MCP integration not found");
        if (falseIntent) {
          await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      }

      const nativeUrlError = await this.resolveNativeServerUrls(action.servers);
      if (nativeUrlError) {
        await this.chatbot.addParameter("flowError", nativeUrlError);
        if (falseIntent) {
          await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      }

      const flowVariables = {
        'x-chatbotToken': requestVariables.chatbotToken,
        'x-project-id': requestVariables.project_id,
        'x-conversation-id': requestVariables.conversation_id,
        'x-department-id': requestVariables.department_id,
        'x-chatbot-name': requestVariables.chatbot_name,
        'x-chatbot-id': this.chatbot.botId,
        'x-user-id': requestVariables.user_id || requestVariables.userLeadId,
        'x-last-user-text': requestVariables.lastUserText,
      };

      json.servers = this.arrayToObject(action.servers, mcp_integration, flowVariables);
      winston.debug("DirAiPrompt json.servers: ", json.servers);
      if (!json.servers) {
        await this.chatbot.addParameter("flowError", "Can't process MCP Servers");
        if (falseIntent) {
          await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback();
          return;
        }
        callback();
        return;
      }
      console.log('json.servers', json.servers);
    }


    // Handle reasoning if enabled
    let apiEndpoint = "/ask";

    if (action.reasoning === true) {
      let reasoningLevel = 'low';
      if (action.reasoningLevel && reasoningLevels.includes(action.reasoningLevel.toLowerCase())) { 
        reasoningLevel = action.reasoningLevel.toLowerCase();
        this.logger.native(`[AI Prompt] Reasoning enabled with level: ${reasoningLevel}`);
      } else {
        this.logger.native(`[AI Prompt] Reasoning enabled with default level: ${reasoningLevel}`);
      }
      
      apiEndpoint = "/thinking";
      this.logger.native(`[AI Prompt] Reasoning enabled with level: ${reasoningLevel}`);
      winston.debug("DirAiPrompt Reasoning enabled, using /thinking endpoint");
      json.thinking = this.#buildThinkingObject(reasoningLevel, action.max_tokens);
    }

    winston.debug("DirAiPrompt json: ", json);
    console.log("DirAiPrompt json: ", json);

    const { err, resbody } = await llmAskService.ask(json, apiEndpoint, "DirAiPrompt");

    if (err) {
      winston.error("DirAiPrompt openai err: ", err.response?.data);
      await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);
      let error;
      if (err.response?.data?.detail && err.response?.data?.detail[0]) {
        error = err.response.data.detail[0]?.msg;
      } else if (err.response?.data?.detail && err.response?.data?.detail?.answer) {
        error = err.response.data.detail.answer;
      } else if (err.response?.data) {
        error = JSON.stringify(err.response.data);
      } else {
        error = err.message || "General error executing action" // String(err);
      }
      winston.error("DirAiPrompt error executing action: " + error);
      this.logger.error("[AI Prompt] error executing action: ", error);
      if (falseIntent) {
        await this.chatbot.addParameter("flowError", "AiPrompt Error: " + error);
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    } else {

      winston.debug("DirAiPrompt resbody: ", resbody);
      answer = resbody.answer;
      this.logger.native("[AI Prompt] answer: ", answer);

      let reasoning_content = null;
      if (action.reasoning === true) {
        reasoning_content = resbody.reasoning_content;
        this.logger.native("[AI Prompt] reasoning_content: ", reasoning_content);
        await this.chatbot.addParameter("reasoning_content", reasoning_content);
      }

      if (publicKey === true) {
        let tokens_usage = {
          tokens: resbody.prompt_token_info?.total_tokens || 0,
          model: json.model
        }
        quotasService.updateQuote(this.projectId, this.token, tokens_usage);
      }

      await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }], ['assignReasoningContentTo', reasoning_content, { onlyIfTruthy: true }]]);

      if (trueIntent) {
        await this._executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

  }

  // Delegates to AiPromptRequestService (services/AiPromptRequestService.js).
  async checkMandatoryParameters(action) {
    return await aiPromptRequestService.checkMandatoryParameters(action);
  }

  // Delegates to AiPromptRequestService (services/AiPromptRequestService.js).
  async transcriptToLLM(transcript) {
    return await aiPromptRequestService.transcriptToLLM(transcript);
  }

  // Delegates to AiPromptRequestService (services/AiPromptRequestService.js).
  #buildThinkingObject(level, max_tokens) {
    return aiPromptRequestService.buildThinkingObject(level, max_tokens);
  }

  // Fields accepted by the LLM server schema. Everything else (id, native,
  // customHeaders, oauth, tools, ...) is internal and must not be forwarded.
  static SERVER_ALLOWED_FIELDS = aiPromptRequestService.SERVER_ALLOWED_FIELDS;

  arrayToObject(arr, mcp_integration, flowVariables) {
    if (!Array.isArray(arr)) {
      winston.warn("DirAiPrompt Can't process MCP Severs: 'servers' must be an array")
      this.logger.warn("[AI Prompt] Can't process MCP Severs: 'servers' must be an array");
      return null;
    }

    const integrationServers = Array.isArray(mcp_integration?.value?.servers)
      ? mcp_integration.value.servers
      : [];

    return arr.reduce((acc, server) => {
      const integrationServer = this.getIntegrationServer(integrationServers, server);

      const cleanServer = {};
      for (const field of DirAiPrompt.SERVER_ALLOWED_FIELDS) {
        if (field === 'headers') continue;
        if (server[field] !== undefined) {
          cleanServer[field] = server[field];
        }
      }

      cleanServer.enabled_tools = this.buildEnabledTools(server);

      const integrationHeaders = this.customHeadersToObject(integrationServer?.customHeaders);
      const serverFlowVariables = server.native === true ? flowVariables : null;
      cleanServer.headers = this.mergeHeadersWithVariables(integrationHeaders, serverFlowVariables);

      acc[server.name] = cleanServer;
      return acc;
    }, {});
  }

  // Delegates to AiPromptRequestService (services/AiPromptRequestService.js).
  buildEnabledTools(server) {
    return aiPromptRequestService.buildEnabledTools(server);
  }

  // Delegates to AiPromptRequestService (services/AiPromptRequestService.js).
  getIntegrationServer(integrationServers, server) {
    return aiPromptRequestService.getIntegrationServer(integrationServers, server);
  }

  // Delegates to AiPromptRequestService (services/AiPromptRequestService.js).
  enrichServersFromIntegration(servers, mcp_integration) {
    return aiPromptRequestService.enrichServersFromIntegration(servers, mcp_integration);
  }

  // Delegates to AiPromptRequestService (services/AiPromptRequestService.js).
  customHeadersToObject(customHeaders) {
    return aiPromptRequestService.customHeadersToObject(customHeaders);
  }

  // Delegates to AiPromptRequestService (services/AiPromptRequestService.js).
  mergeHeadersWithVariables(existingHeaders, variables) {
    return aiPromptRequestService.mergeHeadersWithVariables(existingHeaders, variables);
  }

  async resolveNativeServerUrls(servers) {
    if (!Array.isArray(servers)) return null;

    const nativeServers = servers.filter(server => server.native === true);
    if (nativeServers.length === 0) return null;

    let nativeMcpCache = await this.getNativeMcpServersFromCache();
    if (!nativeMcpCache) {
      await this.fetchNativeMcpServers();
      nativeMcpCache = await this.getNativeMcpServersFromCache();
    }

    if (!nativeMcpCache) {
      this.logger.error("[AI Prompt] native MCP servers cache not found");
      winston.error("DirAiPrompt native MCP servers cache not found");
      return "AiPrompt Error: native MCP servers not available";
    }

    for (const server of nativeServers) {
      const cachedServer = this.findNativeServerInCache(nativeMcpCache, server.id);
      if (cachedServer?.url) {
        server.url = cachedServer.url;
      }
    }

    const unresolved = nativeServers.filter(server => !server.url);
    if (unresolved.length > 0) {
      const names = unresolved.map(server => server.name || server.id).join(", ");
      this.logger.error("[AI Prompt] native MCP server url not found for: ", names);
      winston.error("DirAiPrompt native MCP server url not found for: ", names);
      return "AiPrompt Error: native MCP server url not found for " + names;
    }

    return null;
  }

  async getNativeMcpServersFromCache() {
    try {
      const cached = await this.tdcache.get(NATIVE_MCP_CACHE_KEY);
      if (!cached) return null;
      return JSON.parse(cached);
    } catch (err) {
      this.logger.error("[AI Prompt] Error reading native MCP cache: ", err);
      winston.error("DirAiPrompt Error reading native MCP cache: ", err);
      return null;
    }
  }

  findNativeServerInCache(cache, serverId) {
    if (!cache || !serverId) return null;

    if (Array.isArray(cache)) {
      return cache.find(server => server.id === serverId);
    }

    if (typeof cache === 'object') {
      return cache[serverId];
    }

    return null;
  }

  async fetchNativeMcpServers() {
    const { err } = await mcpService.fetchNativeServers(this.projectId, this.token, "DirAiPrompt");
    if (err) {
      this.logger.error("[AI Prompt] Error fetching native MCP servers: ", err);
      winston.error("DirAiPrompt Error fetching native MCP servers: ", err);
    }
  }

  // Delegates to AiPromptRequestService (services/AiPromptRequestService.js).
  async detectAttach(source) {
    return await aiPromptRequestService.detectAttach(source);
  }
  
}

module.exports = { DirAiPrompt }
