const integrationService = require("./IntegrationService");

class AIController {

    constructor() {}

    async resolveLLMConfig(id_project, provider = 'openai', model, token) {

        if (provider === 'ollama' || provider === 'vllm') {
            try {
                const integration = await integrationService.getIntegration(id_project, provider, token);
                if (!integration?.value?.url) {
                    throw { code: 422, error: `Server url for ${provider} is empty or invalid`}
                }

                return {
                    provider,
                    name: model,
                    url: integration.value.url,
                    api_key: integration.value.api_key || ""
                }

            } catch (err) {
                throw { code: err.code, error: err.error }
            }
        } 

        try {
            let key = await integrationService.getKeyFromIntegrations(id_project, provider, token);

            return {
                provider,
                name: model,
                api_key: key
            }

        } catch (err) {
            throw { code: err.code, error: err.error }
        }
    }
}

const aiController = new AIController();
module.exports = aiController;