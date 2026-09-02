const integrationService = require('./IntegrationService');

/**
 * Single owner of "which LLM key do we use for this project?".
 *
 * `process.env.GPTKEY` was read in six directives. Comparing the six showed
 * TWO distinct resolution orders and one one-off, so this service exposes the
 * two shared orders and a plain accessor for the third rather than flattening
 * them into one:
 *
 *  A. `resolveOpenAIKey` - DirAddKbContent, DirAskGPT, DirGptTask
 *       integration "openai" -> env GPTKEY (public)
 *
 *  B. `resolveLlmKey` - DirAiPrompt, DirAiCondition
 *       integration `<llm>` -> env GPTKEY, but ONLY when llm === "openai"

 *
 *  C. DirAskGPTV2 resolves its whole model through `AIController`
 *     (`resolveLLMConfig`) and then falls back on `model.provider === 'openai'`
 *     rather than on an action attribute. That is a third shape with a single
 *     call site, so it keeps its own two-line branch and only takes
 *     `publicGptKey()` from here.
 *
 * A and B were two orders until the project kb-settings step was dropped from
 * key retrieval (main, "remove getKeyFromKbSettings method and update key
 * retrieval logic"). With that step gone A is exactly B with llm = "openai",
 * plus the one hook only DirAddKbContent uses, so A is expressed as that
 * rather than as a second copy of the same three lines.
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
   * Resolution order A: the project's OpenAI integration, then the shared env
   * key.
   *
   * @param {string} id_project
   * @param {string} token                      raw JWT
   * @param {object} [options]
   * @param {function():void} [options.onPublicKey]
   *        called right before falling back to `GPTKEY`
   * @param {function():void} [options.onOwnKey]
   *        called when a project key WAS found (only DirAddKbContent logs here)
   * @returns {Promise<{key: (string|undefined|null), publicKey: boolean}>}
   */
  async resolveOpenAIKey(id_project, token, options = {}) {
    const { onPublicKey, onOwnKey } = options;

    const resolved = await this.resolveLlmKey(id_project, 'openai', token, { onPublicKey });

    // `publicKey` is set with the fallback, so its opposite is "the project's
    // own integration answered" -- which is exactly when the inline code took
    // the else branch and logged.
    if (!resolved.publicKey && onOwnKey) { onOwnKey(); }

    return resolved;
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
