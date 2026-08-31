const { TiledeskChatbot } = require('../../../engine/TiledeskChatbot');
const { Filler } = require('../../Filler');
const { DirIntent } = require("../flow/DirIntent");
require('dotenv').config();
const winston = require('../../../utils/winston');
const quotasService = require("../../../services/QuotasService");
const kbService = require("../../../services/KbService");
const llmKeyService = require("../../../services/LLMKeyService");
const { apiEndpoint } = require("../../../config/endpoints");
const { BaseDirective } = require("../../BaseDirective");
const { Directives } = require('../Directives');

class DirAddKbContent extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.ADD_KB_CONTENT];

  constructor(context) {
    super(context);
    this.chatbot = context.chatbot;
    this.log = context.log;

    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
    winston.debug("DirAddKbContent directive: ", directive);
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.debug("DirAddKbContent Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Add to KnwoledgeBase] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("[DirAddKbContent] action:", action);
    if (!this.tdcache) {
      winston.error("[DirAddKbContent] Error: tdcache is mandatory");
      callback();
      return;
    }

    let publicKey = false;
    let type = action.type;
    let name = action.name;
    let content = action.content;
    let engine;

    // default values
    let namespace = this.context.projectId;

    if (action.namespace) {
      namespace = action.namespace;
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );

    const filler = new Filler();
    const filled_content = filler.fill(content, requestVariables);
    const filled_name = filler.fill(name, requestVariables);

    winston.verbose("[DirAddKbContent] KbEndpoint URL: " + apiEndpoint());

    const resolved_key = await llmKeyService.resolveOpenAIKey(this.projectId, this.token, {
      caller: "(DirAddKbContent)",
      onIntegrationMiss: () => {
        this.logger.native("[Add to KnwoledgeBase] Using shared OpenAI key");
        winston.verbose("[DirAddKbContent] - Key not found in Integrations. Searching in kb settings...");
      },
      onPublicKey: () => {
        winston.verbose("[DirAddKbContent] - Retrieve public gptkey")
      },
      onOwnKey: () => {
        this.logger.native("[Add to KnwoledgeBase] Use your own OpenAI key")
      }
    });
    let key = resolved_key.key;
    publicKey = resolved_key.publicKey;

    if (!key) {
      winston.info("[DirAddKbContent] Error: gptkey is mandatory");
      await this.chatbot.addParameter("flowError", "[DirAddKbContent] Error: gptkey is mandatory");
      callback();
      return;
    }

    if (publicKey === true) {
      let keep_going = await quotasService.checkQuoteAvailability(this.projectId, this.token);
      if (keep_going === false) {
        this.logger.warn("[Add to KnwoledgeBase] Tokens quota exceeded. Skip the action")
        winston.verbose("[DirAddKbContent] - Quota exceeded for tokens. Skip the action")
        await this.chatbot.addParameter("flowError", "[DirAddKbContent] Error: tokens quota exceeded");
        callback(true);  
        return;
      }
    }

    if (!namespace) {
      this.logger.error("[Add to KnwoledgeBase] Namespace is undefined")
      winston.verbose("[DirAddKbContent] - Error: namespace is undefined")
      await this.chatbot.addParameter("flowError", "[DirAddKbContent] Error: namespace is undefined");
      callback(true);
      return;
    }

    let ns;

    if (action.namespaceAsName) {
      // Namespace could be an attribute
      const filled_namespace = filler.fill(action.namespace, requestVariables)
      this.logger.native("[Add to KnwoledgeBase] Searching namespace by name ", filled_namespace);
      ns = await kbService.getNamespaceOrNull(this.context.projectId, this.context.token, filled_namespace, null, "DirAddKbContent");
      namespace = ns?.id;
      winston.verbose("[DirAddKbContent] - Retrieved namespace id from name " + namespace);
    } else {
      this.logger.native("[Add to KnwoledgeBase] Searching namespace by id ", namespace);
      ns = await kbService.getNamespaceOrNull(this.context.projectId, this.context.token, null, namespace, "DirAddKbContent");
    }

    if (!ns) {
      this.logger.error("[Add to KnwoledgeBase] Namespace not found");
      await this.chatbot.addParameter("flowError", "[DirAddKbContent] Error: namespace not found");
      callback();
      return;
    }

    // if (ns.engine) {
    //   engine = ns.engine;
    // } else {
    //   engine = await this.setDefaultEngine(ns.hybrid);
    // }
    
    let json = {
      content: filled_content,
      namespace: namespace,
      type: type,
      name: filled_name,
      source: filled_name
    };

    if (action.tags && Array.isArray(action.tags) && action.tags.every(tag => typeof tag === "string")) {
      json .tags = action.tags;
    }
    
    winston.debug("[DirAddKbContent] json:", json);

    const { err, resbody } = await kbService.addContent(this.projectId, this.context.token, json, "[DirAddKbContent]");

    if (err) {
      this.logger.error("[Add to KnwoledgeBase] error: " + JSON.stringify(err?.response));
      winston.error("[DirAddKbContent] error: ", err?.response);
      if (callback) {
        callback();
        return;
      }
    }
    else if (resbody.success === true) {
      winston.debug("[DirAddKbContent] resbody: ", resbody);
      callback();
      return;
    } else {
      callback();
      return;
    }
  }

  // async setDefaultEngine() {
  //   let isHybrid = hybrid === true;
  //   return new Promise((resolve) => {
  //     let engine = {
  //       name: "pinecone",
  //       type: isHybrid ? "serverless" : "pod",
  //       apikey: "",
  //       vector_size: 1536,
  //       index_name: isHybrid ? "hybrid_index" : "standard_index"
  //     }
  //     resolve(engine);
  //   })
  // }

}

module.exports = { DirAddKbContent }