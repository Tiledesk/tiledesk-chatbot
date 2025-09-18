const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [
		// blocks with conditions
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "ai_prompt_missing_question",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "ai_prompt",
				"_tdActionTitle": "ai action",
				"assignReplyTo": "ai_reply",
				"llm": "myllm",
				"model": "llmmodel",
				"max_tokens": 512,
				"temperature": 0.7,
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
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
				"_tdActionType": "ai_prompt",
				"_tdActionTitle": "ai action",
				"assignReplyTo": "ai_reply",
				"question": "this is the question",
				"model": "llmmodel",
				"max_tokens": 512,
				"temperature": 0.7,
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
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
				"_tdActionType": "ai_prompt",
				"_tdActionTitle": "ai action",
				"assignReplyTo": "ai_reply",
				"question": "this is the question",
				"llm": "myllm",
				"max_tokens": 512,
				"temperature": 0.7,
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "ai_prompt_missing_llm_key",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "ai_prompt",
				"_tdActionTitle": "ai action",
				"assignReplyTo": "ai_reply",
				"question": "this is the question",
				"llm": "myllm",
				"model": "llmmodel",
				"max_tokens": 512,
				"temperature": 0.7,
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
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
				"_tdActionType": "ai_prompt",
				"_tdActionTitle": "ai action",
				"assignReplyTo": "ai_reply",
				"question": "this is the question",
				"llm": "ollama",
				"model": "mymodel",
				"max_tokens": 512,
				"temperature": 0.7,
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
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
				"fallbackIntent": "#SUCCESS",
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