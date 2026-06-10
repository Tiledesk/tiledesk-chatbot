const integrationService = require("./IntegrationService");

class AIController {

    constructor() {}

    async resolveLLMConfig(id_project, provider = 'openai', model, token, vllmServer) {

        if (provider === 'ollama' || provider === 'vllm') {
            const integration = await integrationService.getIntegration(id_project, provider, token);
            if (!integration?.value) {
                throw { code: 422, error: `${provider} integration not found` };
            }

            const value = integration.value;

            if (provider === 'vllm' && Array.isArray(value.servers)) {
                if (!vllmServer) {
                    throw { code: 422, error: "vllmServer attribute is undefined" };
                }
                const server = value.servers.find(s => s.name === vllmServer);
                if (!server) {
                    throw { code: 422, error: `vllm server '${vllmServer}' not found` };
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
