// Same shape as the voice bots: "kb" generates the answer with an AI Prompt into {{prompt_reply}},
// "kbo" speaks it with a speech_form (reached through a block jump, i.e. /exec).
const bot = {
	"webhook_enabled": false,
	"language": "it",
	"name": "Voice stream bot",
	"type": "tilebot",
	"intents": [
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "it",
			"intent_display_name": "kb",
			"intent_id": "3c1f0a52-8f0e-4a7b-9d55-2f4b1e6a7c01",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "ai_prompt",
				"_tdActionId": "ai-prompt-kb",
				"assignReplyTo": "prompt_reply",
				"question": "{{lastUserText}}",
				"llm": "openai",
				"model": "gpt-4o",
				"max_tokens": 256,
				"temperature": 0.7,
				"trueIntent": "#KBO",
				"falseIntent": "#FAILURE"
			}]
		},
		{
			// same as "kb" through OpenRouter (hybrid reasoning model, reasoning not enabled in the block)
			"webhook_enabled": false,
			"enabled": true,
			"language": "it",
			"intent_display_name": "kbor",
			"intent_id": "7d2e9b14-1c3a-4f6e-8a90-5b7c3d2e1f04",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "ai_prompt",
				"_tdActionId": "ai-prompt-kbor",
				"assignReplyTo": "prompt_reply",
				"question": "{{lastUserText}}",
				"llm": "openrouter",
				"model": "deepseek/deepseek-v4.1-flash-1017",
				"max_tokens": 256,
				"temperature": 0.3,
				"trueIntent": "#KBO",
				"falseIntent": "#FAILURE"
			}]
		},
		{
			// OpenRouter model not in VOICE_REASONING_OFF_MODELS (e.g. mandatory reasoning)
			"webhook_enabled": false,
			"enabled": true,
			"language": "it",
			"intent_display_name": "kborx",
			"intent_id": "9a4c1e27-5b3d-4c8f-b1a2-6d8e0f9c3b15",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "ai_prompt",
				"_tdActionId": "ai-prompt-kborx",
				"assignReplyTo": "prompt_reply",
				"question": "{{lastUserText}}",
				"llm": "openrouter",
				"model": "openai/gpt-oss-120b",
				"max_tokens": 256,
				"temperature": 0.3,
				"trueIntent": "#KBO",
				"falseIntent": "#FAILURE"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "it",
			"intent_display_name": "kbo",
			"intent_id": "KBO",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "speech_form",
				"_tdActionId": "speech-form-kbo",
				"attributes": {
					"disableInputMessage": false,
					"commands": [
						{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "{{prompt_reply}}" } },
						{ "type": "wait", "time": 0 },
						{ "type": "settings", "subType": "speech_form", "settings": { "bargein": true, "noInputTimeout": 10000 } }
					]
				}
			}]
		},
		{
			// no LLM: a turn that can be superseded between two actions (DirectivesChatbotPlug.nextDirective)
			"webhook_enabled": false,
			"enabled": true,
			"language": "it",
			"intent_display_name": "slow",
			"intent_id": "SLOW",
			"form": {},
			"question": "",
			"actions": [
				{ "_tdActionType": "wait", "_tdActionId": "wait-slow", "millis": 1000 },
				{
					"_tdActionType": "reply",
					"_tdActionId": "reply-slow",
					"text": "slow done",
					"attributes": { "commands": [{ "type": "message", "message": { "type": "text", "text": "slow done" } }] }
				}
			]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "it",
			"intent_display_name": "failure",
			"intent_id": "FAILURE",
			"actions": [{
				"_tdActionType": "reply",
				"text": "xxx",
				"attributes": {
					"commands": [
						{ "type": "message", "message": { "type": "text", "text": "Error: {{flowError}}" } }
					]
				}
			}]
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
