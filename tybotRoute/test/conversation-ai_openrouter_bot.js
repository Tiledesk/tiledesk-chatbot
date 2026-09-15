const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "ai_prompt_openrouter",
			"intent_id": "7d2b9f3e-1c4a-4e8b-9a61-0f5e2c7d8b01",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "ai_prompt",
				"_tdActionTitle": "ai action",
				"assignReplyTo": "ai_reply",
				"question": "this is the question",
				"llm": "openrouter",
				"model": "openai/gpt-4o",
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
			"intent_display_name": "ai_condition_openrouter",
			"intent_id": "7d2b9f3e-1c4a-4e8b-9a61-0f5e2c7d8b02",
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
				"llm": "openrouter",
				"model": "openai/gpt-4o",
				"max_tokens": 512,
				"temperature": 0.7,
				"fallbackIntent": "#FAILURE",
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
