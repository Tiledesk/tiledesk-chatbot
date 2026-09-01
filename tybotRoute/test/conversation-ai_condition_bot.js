const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [
		// Every block below is an `ai_condition` action. They used to be
		// `_tdActionType: "ai_prompt"` -- a verbatim copy of the first five blocks of
		// conversation-ai_prompt_bot.js -- so conversation-ai_condition_test.js drove
		// DirAiPrompt while asserting "AiCondition Error: ..." strings and could never
		// pass. The display names are kept because the test sends them as /commands.
		//
		// DirAiCondition has no `question`: it builds its prompt from `intents` +
		// `instructions`, and iterates `action.intents` unconditionally, so every
		// block needs one. `errorIntent` is the connector DirAiCondition follows on
		// failure (DirAiPrompt uses trueIntent/falseIntent); `fallbackIntent` is the
		// one it follows when the model's answer matches no label.
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "ai_condition_no_question",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "ai_condition",
				"_tdActionTitle": "ai condition",
				"assignReplyTo": "ai_reply",
				"intents": [
					{
						"label": "medical",
						"prompt": "user asking for medical information",
						"conditionIntentId": "#SUCCESS"
					}
				],
				"instructions": "User question: {{last_user_text}}",
				"llm": "myllm",
				"model": "llmmodel",
				"max_tokens": 512,
				"temperature": 0.7,
				"fallbackIntent": "#FALLBACK",
				"errorIntent": "#FAILURE",
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "ai_prompt_missing_llm",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "ai_condition",
				"_tdActionTitle": "ai condition",
				"assignReplyTo": "ai_reply",
				"intents": [
					{
						"label": "medical",
						"prompt": "user asking for medical information",
						"conditionIntentId": "#SUCCESS"
					}
				],
				"instructions": "User question: {{last_user_text}}",
				"model": "llmmodel",
				"max_tokens": 512,
				"temperature": 0.7,
				"fallbackIntent": "#FALLBACK",
				"errorIntent": "#FAILURE",
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "ai_prompt_missing_model",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "ai_condition",
				"_tdActionTitle": "ai condition",
				"assignReplyTo": "ai_reply",
				"intents": [
					{
						"label": "medical",
						"prompt": "user asking for medical information",
						"conditionIntentId": "#SUCCESS"
					}
				],
				"instructions": "User question: {{last_user_text}}",
				"llm": "myllm",
				"max_tokens": 512,
				"temperature": 0.7,
				"fallbackIntent": "#FALLBACK",
				"errorIntent": "#FAILURE",
			}]
		},
		{
			// Driven by three tests: the missing-key one (404 on the integration),
			// the success one (answer matches no label -> fallbackIntent) and the
			// /api/ask-fails one (422 -> errorIntent).
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "ai_prompt_missing_llm_key",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "ai_condition",
				"_tdActionTitle": "ai condition",
				"assignReplyTo": "ai_reply",
				"intents": [
					{
						"label": "medical",
						"prompt": "user asking for medical information",
						"conditionIntentId": "#MEDICAL"
					}
				],
				"instructions": "User question: {{last_user_text}}",
				"llm": "myllm",
				"model": "llmmodel",
				"max_tokens": 512,
				"temperature": 0.7,
				"fallbackIntent": "#SUCCESS",
				"errorIntent": "#FAILURE",
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "ai_prompt_ollama_success",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "ai_condition",
				"_tdActionTitle": "ai condition",
				"assignReplyTo": "ai_reply",
				"intents": [
					{
						"label": "medical",
						"prompt": "user asking for medical information",
						"conditionIntentId": "#MEDICAL"
					}
				],
				"instructions": "User question: {{last_user_text}}",
				"llm": "ollama",
				"model": "mymodel",
				"max_tokens": 512,
				"temperature": 0.7,
				"fallbackIntent": "#SUCCESS",
				"errorIntent": "#FAILURE",
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "ai_condition_vllm_success",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "ai_condition",
				"assignReplyTo": "ai_reply",
				"intents": [
					{
						"label": "medical",
						"prompt": "user asking for medical information",
						"conditionIntentId": "#SUCCESS"
					},
					{
						"label": "buy",
						"prompt": "user asking to buy a product",
						"conditionIntentId": "#FAILURE"
					}
				],
				"instructions": "User question: {{last_user_text}}",
				"llm": "vllm",
				"model": "gpt-oss-30b",
				"vllmServer": "Cerebras",
				"max_tokens": 512,
				"temperature": 0.7,
				"fallbackIntent": "#FAILURE",
				"errorIntent": "#FAILURE",
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "ai_condition_success",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "ai_condition",
				"question": "this is the question",
				"intents": [
					{
						"label": "26efa629-686e-4a23-a2f8-38c8f5beb408",
						"prompt": "user asking for medical information",
						"conditionIntentId": "#MEDICAL"
					},
					{
						"label": "26efa629-686e-4a23-a2f8-38c8f5beb408",
						"prompt": "user asking to buy a product",
						"conditionIntentId": "#BUY"
					},
					{
						"label": "26efa629-686e-4a23-a2f8-38c8f5beb408",
						"prompt": "{{price}} > 300 dollars",
						"conditionIntentId": "#TOOMUCH"
					}
			    ],
				"instructions": "User question: {{last_user_text}}",
				"llm": "openai",
				"model": "gpt-4o",
				"max_tokens": 512,
				"temperature": 0.7,
				"fallbackIntent": "#FALLBACK",
				"errorIntent": "#FAILURE",
			}]
		},
		{
			// TRUE INTENT
			"webhook_enabled": false,
			"enabled": true,
			"actions": [{
				"_tdActionType": "reply",
				"text": "xxx",
				"attributes": {
					"commands": [{
						"type": "wait",
						"time": 500
					}, {
						"type": "message",
						"message": {
							"type": "text",
							"text": "Answer: {{ai_reply}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "gpt intent true",
			"intent_id": "SUCCESS"
		},
		{
			// FALSE INTENT
			"webhook_enabled": false,
			"enabled": true,
			"actions": [{
				"_tdActionType": "reply",
				"text": "xxx",
				"attributes": {
					"commands": [{
						"type": "wait",
						"time": 500
					}, {
						"type": "message",
						"message": {
							"type": "text",
							"text": "Error: {{flowError}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "gpt intent false",
			"intent_id": "FAILURE"
		}
	]
}

// normalize the bot structure for the static intent search
let intents = bot.intents;
delete bot.intents;
let intents_dict_by_display_name = {};
for (let i = 0; i < intents.length; i++) {
	intents_dict_by_display_name[intents[i].intent_display_name] = intents[i];
}
let intents_dict_by_intent_id = {};
for (let i = 0; i < intents.length; i++) {
	intents_dict_by_intent_id[intents[i].intent_id] = intents[i];
}

bot.intents = intents_dict_by_display_name;
bot.intents_by_intent_id = intents_dict_by_intent_id
const bots_data = {
	"bots": {}
}
bots_data.bots["botID"] = bot;

module.exports = { bots_data: bots_data };