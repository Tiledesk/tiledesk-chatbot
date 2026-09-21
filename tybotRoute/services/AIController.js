const integrationService = require("./IntegrationService");

class AIController {

    constructor() {}

    // llmServer is the generic named-server key. vllm still accepts the 5th
    // positional argument as vllmServer for existing actions.
    async resolveLLMConfig(id_project, provider = 'openai', model, token, llmServer) {

        if (provider === 'openrouter') {
            const integration = await integrationService.getIntegration(id_project, provider, token);
            if (!integration?.value?.apikey) {
                throw { code: 422, error: "The key provided for openrouter is not valid or undefined" };
            }

            return buildOpenRouterModel(integration.value, model);
        }

        if (provider === 'agentplatform') {
            const integration = await integrationService.getIntegration(id_project, provider, token);
            if (!integration?.value) {
                throw { code: 404, error: "integration agentplatform not found" };
            }

            const value = integration.value;
            if (!Array.isArray(value.servers)) {
                throw { code: 422, error: "agentplatform servers list is missing or invalid" };
            }
            if (!llmServer) {
                throw { code: 422, error: "llmServer attribute is undefined" };
            }
            const server = value.servers.find(s => s.name === llmServer);
            if (!server) {
                throw { code: 422, error: `agentplatform server '${llmServer}' not found` };
            }
            if (!server.project || typeof server.project !== 'string') {
                throw { code: 422, error: "Project for agentplatform is empty or invalid" };
            }
            if (!server.location || typeof server.location !== 'string') {
                throw { code: 422, error: "Location for agentplatform is empty or invalid" };
            }
            return {
                provider: "google",
                name: model,
                api_key: server.apikey,
                project: server.project,
                location: server.location
            };
        }

        if (provider === 'ollama' || provider === 'vllm') {
            const integration = await integrationService.getIntegration(id_project, provider, token);
            if (!integration?.value) {
                throw { code: 422, error: `${provider} integration not found` };
            }

            const value = integration.value;

            if (provider === 'vllm' && Array.isArray(value.servers)) {
                if (!llmServer) {
                    throw { code: 422, error: "vllmServer attribute is undefined" };
                }
                const server = value.servers.find(s => s.name === llmServer);
                if (!server) {
                    throw { code: 422, error: `vllm server '${llmServer}' not found` };
                }
                if (!server.url) {
                    throw { code: 422, error: "Server url for vllm is empty or invalid" };
                }
                return {
                    provider,
                    name: model,
                    url: server.url,
                    api_key: server.apikey || ""
                };
            }

            if (!value.url) {
                throw { code: 422, error: `Server url for ${provider} is empty or invalid` };
            }

            return {
                provider,
                name: model,
                url: value.url,
                api_key: value.apikey || "",
                token: value.token ?? null
            };
        }

        const key = await integrationService.getKeyFromIntegrations(id_project, provider, token);

        return {
            provider,
            name: model,
            api_key: key
        };
    }
}

const aiController = new AIController();
module.exports = aiController;
