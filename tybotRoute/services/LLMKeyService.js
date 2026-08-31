const integrationService = require('./IntegrationService');
const kbSettingsService = require('./KbSettingsService');

/**
 * Single owner of "which LLM key do we use for this project?".
 *
 * `process.env.GPTKEY` was read in six directives. Comparing the six showed
 * TWO distinct resolution orders and one one-off, so this service exposes the
 * two shared orders and a plain accessor for the third rather than flattening
 * them into one:
 *
 *  A. `resolveOpenAIKey` - DirAddKbContent, DirAskGPT, DirGptTask
 *       integration "openai" -> project kb settings -> env GPTKEY (public)
 *
 *  B. `resolveLlmKey` - DirAiPrompt, DirAiCondition
 *       integration `<llm>` -> env GPTKEY, but ONLY when llm === "openai"
 *       (there is no kb-settings step in this order)
 *
 *  C. DirAskGPTV2 resolves its whole model through `AIController`
 *     (`resolveLLMConfig`) and then falls back on `model.provider === 'openai'`
 *     rather than on an action attribute. That is a third shape with a single
 *     call site, so it keeps its own two-line branch and only takes
 *     `publicGptKey()` from here.
 *
 * The three (resp. two) copies of each order were identical in control flow and
 * differed ONLY in logging - the flow-logger line and the winston level/prefix.
 * Logging is therefore not performed here: each call site passes its own log
 * statements as hooks, which are invoked synchronously at exactly the point the
 * inline code logged them. Nothing is unified that was not already identical.
 */
class LLMKeyService {

  constructor() { }

  /**
   * The shared/public OpenAI key from the environment.
   * Read at call time, never cached.
   * @returns {string|undefined} process.env.GPTKEY, as-is.
   */
  publicGptKey() {
    return process.env.GPTKEY;
  }

  /**
   * The key used for embeddings (DirAskGPTV2 only). Preserves the historical
   * `EMBEDDING_API_KEY || GPTKEY` falsy-fallback exactly.
   * @returns {string|undefined}
   */
  embeddingApiKey() {
    return process.env.EMBEDDING_API_KEY || process.env.GPTKEY;
  }

  /**
   * Resolution order A: project OpenAI integration, then the project's kb
   * settings, then the shared env key.
   *
   * @param {string} id_project
   * @param {string} token                      raw JWT
   * @param {object} [options]
   * @param {string} [options.caller]           kb-settings log prefix, e.g. "(DirGptTask)"
   * @param {function():void} [options.onIntegrationMiss]
   *        called right before the kb-settings lookup, i.e. where the inline
   *        copies logged "Key not found in Integrations. Searching in kb settings..."
   * @param {function():void} [options.onPublicKey]
   *        called right before falling back to `GPTKEY`
   * @param {function():void} [options.onOwnKey]
   *        called when a project key WAS found (only DirAddKbContent logged here)
   * @returns {Promise<{key: (string|undefined|null), publicKey: boolean}>}
   */
  async resolveOpenAIKey(id_project, token, options = {}) {
    const { caller, onIntegrationMiss, onPublicKey, onOwnKey } = options;

    let publicKey = false;
    let key = await integrationService.getKeyFromIntegrations(id_project, 'openai', token);

    if (!key) {
      if (onIntegrationMiss) { onIntegrationMiss(); }
      key = await kbSettingsService.getKeyFromKbSettings(id_project, token, caller);
    }

    if (!key) {
      if (onPublicKey) { onPublicKey(); }
      key = process.env.GPTKEY;
      publicKey = true;
    } else {
      if (onOwnKey) { onOwnKey(); }
    }

    return { key, publicKey };
  }

  /**
   * Resolution order B: the integration named after the selected llm, then the
   * shared env key but only for "openai". No kb-settings step.
   *
   * Note the historical asymmetry, preserved as-is: `publicKey` is set true
   * together with the fallback even when `GPTKEY` itself is empty, so an unset
   * GPTKEY yields `{ key: undefined, publicKey: true }` exactly as the inline
   * code left its two variables.
   *
   * @param {string} id_project
   * @param {string} llm                         the action's `llm` attribute
   * @param {string} token                       raw JWT
   * @param {object} [options]
   * @param {function():void} [options.onPublicKey]
   *        called right before falling back to `GPTKEY`
   * @returns {Promise<{key: (string|undefined|null), publicKey: boolean}>}
   */
  async resolveLlmKey(id_project, llm, token, options = {}) {
    const { onPublicKey } = options;

    let publicKey = false;
    let key = await integrationService.getKeyFromIntegrations(id_project, llm, token);

    if (!key && llm === "openai") {
      if (onPublicKey) { onPublicKey(); }
      key = process.env.GPTKEY;
      publicKey = true;
    }

    return { key, publicKey };
  }

}

const llmKeyService = new LLMKeyService();
module.exports = llmKeyService;
