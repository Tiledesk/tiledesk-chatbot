const axios = require("axios").default;
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');
let https = require("https");
var path = require('path');
const { DirIntent } = require("./DirIntent");
const { TiledeskChatbotConst } = require("../../engine/TiledeskChatbotConst");
const { TiledeskChatbotUtil } = require("../../utils/TiledeskChatbotUtil");
const assert = require("assert");
require('dotenv').config();
const winston = require('../../utils/winston');
const httpUtils = require("../../utils/HttpUtils");
const { BaseDirective } = require("../BaseDirective");
const kbService = require("../../services/KbService");
const quotasService = require("../../services/QuotasService");
const llmKeyService = require("../../services/LLMKeyService");
const llmAskService = require("../../services/LlmAskService");
const aiController = require("../../services/AIController");
const default_engine = require('../../config/kb/engine');
const default_engine_hybrid = require('../../config/kb/engine.hybrid');
const default_embedding = require("../../config/kb/embedding");
const PromptManager = require('../../config/kb/prompt/rag/PromptManager');
const { MODELS_MULTIPLIER } = require("../../utils/aiUtils");
const { Directives } = require('./Directives');

//const ragPromptManager = new PromptManager(path.join(__dirname, '../../config/kb/prompt/rag'));
const ragPromptManager = new PromptManager(path.join(__dirname, '../../config/kb/prompt/rag'));

const RAG_CONTEXT_ENV_OVERRIDES = {
  "gpt-3.5-turbo":       process.env.GPT_3_5_CONTEXT,
  "gpt-4":               process.env.GPT_4_CONTEXT,
  "gpt-4-turbo-preview": process.env.GPT_4T_CONTEXT,
  "gpt-4o":              process.env.GPT_4O_CONTEXT,
  "gpt-4o-mini":         process.env.GPT_4O_MINI_CONTEXT,
  "gpt-4.1":             process.env.GPT_4_1_CONTEXT,
  "gpt-4.1-mini":        process.env.GPT_4_1_MINI_CONTEXT,
  "gpt-4.1-nano":        process.env.GPT_4_1_NANO_CONTEXT,
  "gpt-5":               process.env.GPT_5_CONTEXT,
  "gpt-5-mini":          process.env.GPT_5_MINI_CONTEXT,
  "gpt-5-nano":          process.env.GPT_5_NANO_CONTEXT,
  "general":             process.env.GENERAL_CONTEXT
};

/** RAG system prompt per modello: file in config/kb/prompt/rag, sovrascrivibili via env (come prima). */
function getRagContextTemplate(modelName) {
  const envOverride = RAG_CONTEXT_ENV_OVERRIDES[modelName];
  if (envOverride) {
    return envOverride;
  }
  if (!PromptManager.modelMap[modelName] && process.env.GENERAL_CONTEXT) {
    return process.env.GENERAL_CONTEXT;
  }
  return ragPromptManager.getPrompt(modelName);
}

const PINECONE_RERANKING = process.env.PINECONE_RERANKING === true || process.env.PINECONE_RERANKING === "true";

class DirAskGPTV2 extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.ASK_GPT_V2];

  constructor(context) {
    super(context);
    this.chatbot = context.chatbot;

    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
    winston.debug("DirAskGPTV2 directive: ", directive);
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.debug("DirAskGPTV2 Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Ask Knowledge Base] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("DirAskGPTV2 action:", action);
    if (!this.tdcache) {
      winston.error("DirAskGPTV2 Error: tdcache is mandatory");
      callback();
      return;
    }
    
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;
    
    winston.debug("DirAskGPTV2 trueIntent", trueIntent)
    winston.debug("DirAskGPTV2 falseIntent", falseIntent)
    winston.debug("DirAskGPTV2 trueIntentAttributes", trueIntentAttributes)
    winston.debug("DirAskGPTV2 falseIntentAttributes", falseIntentAttributes)
    
    // default values
    let answer = "No answers";
    action.llm ??= "openai";
    action.model ??= "gpt-4o";
    
    await this.checkMandatoryParameters(action).catch( async (missing_param) => {
      this.logger.error(`[Ask Knowledge Base] missing attribute '${missing_param}'`);
      await this.chatbot.addParameter("flowError", `AskKnowledgeBase Error: '${missing_param}' attribute is undefined`);
      await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return Promise.reject();
      }
      callback();
      return Promise.reject();
    })

    let {
      namespace = this.context.projectId,
      llm,
      model,
      temperature = 0.7,
      max_tokens = 2048,
      top_k = 4,
      alpha = 0.5,
      citations = false,
      chunks_only = false,
      reranking = false,
      reranking_multiplier = 3,
      skip_unanswered = false,
      use_hyde = false,
      use_cache = false,
      vllmServer = null,
    } = action;

    let transcript;
    
    let requestVariables = null;
    requestVariables =
    await TiledeskChatbot.allParametersStatic(
      this.tdcache, this.requestId
    );
    
    const filler = new Filler();
    const filled_question = filler.fill(action.question, requestVariables);
    const filled_context = filler.fill(action.context, requestVariables);
    const filled_model = filler.fill(action.model, requestVariables);
    

    if (action.history) {
      this.logger.native("[Ask Knowledge Base] use chat transcript")
      let transcript_string = await TiledeskChatbot.getParameterStatic(
        this.context.tdcache,
        this.context.requestId,
        TiledeskChatbotConst.REQ_TRANSCRIPT_KEY
      )
      winston.debug("DirAskGPTV2 transcript string: " + transcript_string)

      if (transcript_string) {
        transcript = await TiledeskChatbotUtil.transcriptJSON(transcript_string);
        winston.debug("DirAskGPTV2 transcript ", transcript)
      } else {
        this.logger.warn("[Ask Knowledge Base] chat transcript is undefined. Skip JSON translation for chat history.");
        winston.verbose("DirAskGPT transcript_string is undefined. Skip JSON translation for chat history")
      }
    }
    
    let publicKey = false;
    let embedding;
    let engine;

    try {
      model = await aiController.resolveLLMConfig(this.projectId, llm, filled_model, this.token, vllmServer);
    } catch (err) {
      const errorMsg = err?.error || `${llm} integration not found`;
      this.logger.error(`[Ask Knowledge Base] Error getting ${llm} integration: `, errorMsg);
      await this.chatbot.addParameter("flowError", `AskKnowledgeBase Error: ${errorMsg}`);
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    // Third key-resolution shape (single call site): the model is already
    // resolved by AIController, and the public fallback keys off
    // model.provider rather than off an action attribute. Only the env read is
    // delegated to LLMKeyService; the branch stays here on purpose.
    if (!model.api_key && model.provider === 'openai') {
      model.api_key = llmKeyService.publicGptKey();
      publicKey = true;
    }

    if (!model.api_key) {
      this.logger.error(`[Ask Knowledge Base] llm key for ${llm} not found in integrations`);
      await this.chatbot.addParameter("flowError", `AskKnowledgeBase Error: missing key for llm ${llm}`);
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    if (publicKey === true && !chunks_only) {
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

    if (!namespace) {
      this.logger.error("[Ask Knowledge Base] Namespace is undefined")
      winston.verbose("DirAskGPTV2 - Error: namespace is undefined")
      if (falseIntent) {
        await this.chatbot.addParameter("flowError", "AskGPT Error: namespace is undefined");
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
    }

    let ns;
    
    if (action.namespaceAsName) {
      // Namespace could be an attribute
      const filled_namespace = filler.fill(action.namespace, requestVariables)
      this.logger.native("[Ask Knowledge Base] Searching namespace by name ", filled_namespace);
      ns = await kbService.getNamespaceOrNull(this.context.projectId, this.context.token, filled_namespace, null, "DirAskGPTV2");
      namespace = ns?.id;
      winston.verbose("DirAskGPTV2 - Retrieved namespace id from name " + namespace);
    } else {
      this.logger.native("[Ask Knowledge Base] Searching namespace by id ", namespace);
      ns = await kbService.getNamespaceOrNull(this.context.projectId, this.context.token, null, namespace, "DirAskGPTV2");
    }

    if (!ns) {
      this.logger.error("[Ask Knowledge Base] Namespace not found")
      await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);
      await this.chatbot.addParameter("flowError", "AskGPT Error: namespace not found");
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }
    
    if (ns.engine) {
      engine = ns.engine;
    } else {
      engine = await this.setDefaultEngine(ns.hybrid);
    }

    embedding = ns.embedding || default_embedding;
    embedding.api_key = llmKeyService.embeddingApiKey();

    let json = {
      question: filled_question,
      namespace: namespace,
      model: model,
      embedding: embedding,
      citations: citations,
      engine: engine,
      debug: true,
      stream: false,
      id_project: this.projectId,
      request_id: this.requestId,
      agent_id: this.chatbot?.bot.root_id || null,
    };
    if (top_k) {
      json.top_k = top_k;
    }
    if (temperature) {
      json.temperature = temperature;
    }
    if (max_tokens) {
      json.max_tokens = max_tokens;
    }
    if (chunks_only) {
      json.chunks_only = chunks_only;
    }
    
    if (ns.hybrid === true) {
      json.search_type = 'hybrid';
      json.alpha = alpha;
      
      if (reranking === true) {
        json.reranking = true;
        json.reranking_multiplier = reranking_multiplier || 3;
        json.reranker_model = "cross-encoder/ms-marco-MiniLM-L-6-v2";

        if ((top_k * reranking_multiplier) > 100) {
          // Find the largest integer reranking_multiplier so that top_k * reranking_multiplier <= 100
          let calculatedRerankingMultiplier = Math.floor(100 / top_k);
          // At least 1 is required
          if (calculatedRerankingMultiplier < 1) {
            calculatedRerankingMultiplier = 1;
          }
          json.reranking_multiplier = calculatedRerankingMultiplier;
        }
      }
    }

    if (!ns.hybrid && reranking === true && PINECONE_RERANKING) {
      json.reranking = {
        "provider": "pinecone",
        "api_key": process.env.PINECONE_API_KEY,
        "model": process.env.PINECONE_RERANKING_MODEL || process.env.RERANKING_MODEL || "bge-reranker-v2-m3"
      }

      json.reranking_multiplier = reranking_multiplier || 3;
      if ((top_k * reranking_multiplier) > 100) {
        // Find the largest integer reranking_multiplier so that top_k * reranking_multiplier <= 100
        let calculatedRerankingMultiplier = Math.floor(100 / top_k);
        // At least 1 is required
        if (calculatedRerankingMultiplier < 1) {
          calculatedRerankingMultiplier = 1;
        }
        json.reranking_multiplier = calculatedRerankingMultiplier;
      }
    }

    if (!action.advancedPrompt) {
      const contextTemplate = getRagContextTemplate(model.name);
      
      if (filled_context) {
        json.system_context = filled_context + "\n" + contextTemplate;
      } else {
        json.system_context = contextTemplate;
      }
    } else {
      json.system_context = filled_context;
    }

    if (transcript) {
      json.chat_history_dict = await this.transcriptToLLM(transcript);
    }

    if (action.tags && Array.isArray(action.tags) && action.tags.every(tag => typeof tag === "string")) {
      json.tags = action.tags;
    }

    if (use_hyde) {
      json.use_hyde = use_hyde;
    }

    if (use_cache) {
      json.use_cache = use_cache;
    }
    
    winston.debug("DirAskGPTV2 json:", json);

    winston.verbose("DirAskGPTV2  KbEndpoint URL: " + llmAskService.qaBaseUrl(ns.hybrid));

    const { err, resbody } = await llmAskService.askNamespace(json, ns.hybrid, this.context.token, "DirAskGPTV2");

    if (err) {
      winston.error("DirAskGPTV2 error: ", {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
      });
      this.logger.error(`[Ask Knowledge Base] Error getting answer`);
      await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);
      if (callback) {
        if (falseIntent) {
          await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      }
    }
    else if (resbody.success === true) {
      winston.debug("DirAskGPTV2 resbody: ", resbody);
      console.log("DirAskGPTV2 resbody: ", JSON.stringify(resbody));
      if (chunks_only) {
        await this._assignAttributes(action, [['assignReplyTo', resbody.answer, { onlyIfTruthy: true }], ['assignSourceTo', resbody.source, { onlyIfTruthy: true }], ['assignChunksTo', resbody.chunks, { onlyIfTruthy: true }]]);
        if (trueIntent) {
          await this._executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;

      } else {
        let json_sources;
        if (citations) {
          json_sources = this.normalizeCitationSources(resbody.citations);
        }
        await this._assignAttributes(action, [['assignReplyTo', resbody.answer, { onlyIfTruthy: true }], ['assignSourceTo', resbody.source, { onlyIfTruthy: true }], ['assignChunksTo', resbody.content_chunks, { onlyIfTruthy: true }], ['assignJsonSourcesTo', json_sources, { onlyIfTruthy: true }]]);
        let tokens = resbody.prompt_token_size;
        if (publicKey === true && !chunks_only) {

          let tokens_usage = {
            tokens: resbody.prompt_token_size,
            model: json.model
          }

          let multiplier = MODELS_MULTIPLIER[json.model.name] ?? 1;
          tokens = tokens * multiplier;
          quotasService.updateQuote(this.projectId, this.token, tokens_usage).catch((err) => {
            winston.error("Error updating quota: ", err);
          })
        }

        const data = {
          namespace: json.namespace,
          question: json.question,
          answer: resbody.answer,
          request_id: this.requestId,
          tokens: tokens
        }
        kbService.addAnsweredQuestion(this.projectId, data, this.token).catch((err) => {
          winston.error("Error adding answered question: ", err);
        })

        if (trueIntent) {
          await this._executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      }
    } else {
      winston.info("DirAskGPTV2 resbody else case: ", resbody);
      await this._assignAttributes(action, [['assignReplyTo', answer, { onlyIfTruthy: true }]]);
      if (!skip_unanswered) {
        const data = {
          namespace: json.namespace,
          question: json.question,
          request_id: this.requestId
        }

        kbService.addUnansweredQuestion(this.projectId, data, this.token).catch((err) => {
          winston.error("DirAskGPTV2 - Error adding unanswered question: ", {
            status: err.response?.status,
            statusText: err.response?.statusText,
            data: err.response?.data,
          });
          this.logger.warn("[Ask Knowledge Base] Unable to add unanswered question", json.question, "to namespacae", json.namespace);
        })
      }
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }
  }

  async checkMandatoryParameters(action) {
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

  normalizeCitationSources(citations) {
    const uniqueMap = new Map();
    for (const { source_id, ...source } of citations) {
      if (!uniqueMap.has(source.source_name)) {
        uniqueMap.set(source.source_name, source);
      }
    }
    return Array.from(uniqueMap.values());
  }

  /**
   * Transforms the transcirpt array in a dictionary like '0': { "question": "xxx", "answer":"xxx"}
   * merging consecutive messages with the same role in a single question or answer.
   * If the first message was sent from assistant, this will be deleted.
   */
  async transcriptToLLM(transcript) {
    
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

  async setDefaultEngine(hybrid = false) {
    if (hybrid) {
      return default_engine_hybrid
    }
    return default_engine;
  }

}

module.exports = { DirAskGPTV2 }
