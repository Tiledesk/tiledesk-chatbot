/**
 * OpenRouter provider routing.
 *
 * The dashboard stores, per model, which upstream providers may serve it and
 * in what order:
 *
 *   integration.value = {
 *     apikey: "sk-or-...",
 *     models: [
 *       { id: "openai/gpt-4o", name: "GPT-4o",
 *         providers: ["azure", "openai"], allow_fallbacks: true, sort: "price" }
 *     ]
 *   }
 *
 * This turns one of those entries into the routing object the LLM microservice
 * forwards to OpenRouter as the request's "provider" block.
 */

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const SORT_VALUES = ['price', 'throughput', 'latency'];

/** The stored configuration for one model id, or undefined when it has none. */
function findModelConfig(value, model) {
    const models = value && Array.isArray(value.models) ? value.models : [];
    const wanted = String(model || '').trim();
    if (!wanted) {
        return undefined;
    }
    return models.find((entry) => entry && String(entry.id || '').trim() === wanted);
}

/**
 * Build the routing block for a model.
 *
 * Returns undefined when the model carries nothing worth routing, so an
 * unconfigured model behaves exactly like any other OpenAI-compatible
 * provider instead of being pinned to an empty provider list.
 */
function buildProviderRouting(value, model) {
    const config = findModelConfig(value, model);
    if (!config) {
        return undefined;
    }

    const routing = {};

    const order = (Array.isArray(config.providers) ? config.providers : [])
        .map((provider) => String(provider || '').trim())
        .filter((provider) => !!provider);
    if (order.length > 0) {
        routing.order = order;
    }

    // true is OpenRouter's own default, so only the restrictive choice is worth sending.
    if (config.allow_fallbacks === false) {
        routing.allow_fallbacks = false;
    }

    const sort = String(config.sort || '').trim().toLowerCase();
    if (SORT_VALUES.includes(sort)) {
        routing.sort = sort;
    }

    return Object.keys(routing).length > 0 ? routing : undefined;
}

/**
 * The model object the LLM microservice expects for an OpenRouter call.
 * `provider_routing` is omitted entirely when there is nothing to route.
 */
function buildOpenRouterModel(value, model) {
    const routing = buildProviderRouting(value, model);

    return {
        provider: 'openrouter',
        name: model,
        url: OPENROUTER_BASE_URL,
        api_key: (value && value.apikey) || '',
        ...(routing && { provider_routing: routing })
    };
}

module.exports = {
    OPENROUTER_BASE_URL,
    findModelConfig,
    buildProviderRouting,
    buildOpenRouterModel
};
