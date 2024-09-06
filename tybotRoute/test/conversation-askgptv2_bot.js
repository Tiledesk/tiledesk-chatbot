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
			"intent_display_name": "gpt_success",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "gpt_reply",
				"assignSourceTo": "gpt_source",
				"model": "gpt-4",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"question": "this is the question: {{last_user_message}}",
				"history": true
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "gpt_success_custom_context",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "gpt_reply",
				"assignSourceTo": "gpt_source",
				"model": "gpt-4",
				"temperature": 0.7,
				"max_tokens": 1000,
				"top_k": 2,
				"context": "this is the context: {{custom_context}}",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"question": "this is the question: {{last_user_message}}",
				"history": true
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "gpt_success_namespace_as_name",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "gpt_reply",
				"assignSourceTo": "gpt_source",
				"model": "gpt-4",
				"temperature": 0.7,
				"max_tokens": 1000,
				"namespace": "Test Namespace",
				"top_k": 2,
				"context": "this is the context: {{custom_context}}",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"question": "this is the question: {{last_user_message}}",
				"advancedPrompt": true,
				"history": true,
				"namespaceAsName": true
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "gpt_success_namespace_as_name_custom_attribute",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "gpt_reply",
				"assignSourceTo": "gpt_source",
				"model": "gpt-4",
				"temperature": 0.7,
				"max_tokens": 1000,
				"namespace": "Test {{ns_name}}",
				"top_k": 2,
				"context": "this is the context: {{custom_context}}",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"question": "this is the question: {{last_user_message}}",
				"advancedPrompt": true,
				"history": true,
				"namespaceAsName": true
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "gpt_success_advanced_context",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "gpt_reply",
				"assignSourceTo": "gpt_source",
				"model": "gpt-4",
				"temperature": 0.7,
				"max_tokens": 1000,
				"top_k": 2,
				"context": "this is the context: {{custom_context}}",
				"advancedPrompt": true,
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"question": "this is the question: {{last_user_message}}",
				"history": true
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action failed",
				"assignReplyTo": "gpt_reply",
				"assignSourceTo": "gpt_source",
				"model": "gpt-4",
				"question": "this is the question: {{last_user_message}}",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"history": true
			}],
			"language": "en",
			"intent_display_name": "gpt_fail",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": ""
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action failed",
				"assignReplyTo": "gpt_reply",
				"assignSourceTo": "gpt_source",
				"kbid": "kb1",
				"question": "",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"history": true
			}],
			"language": "en",
			"intent_display_name": "gpt_fail_noquestion",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": ""
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action failed",
				"assignReplyTo": "gpt_reply",
				"assignSourceTo": "gpt_source",
				"kbid": "",
				"question": "this is the question: {{last_user_message}}",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"history": true
			}],
			"language": "en",
			"intent_display_name": "gpt_fail_nokbid",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": ""
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
							"text": "gpt replied: {{gpt_reply}}"
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
							"text": "gpt replied: {{gpt_reply}}"
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