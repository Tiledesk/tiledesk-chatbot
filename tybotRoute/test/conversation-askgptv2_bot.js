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
			"intent_display_name": "kb_success",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
				"assignChunksTo": "kb_chunks",
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
			"intent_display_name": "kb_success_custom_context",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
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
			"intent_display_name": "kb_success_citations_on",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
				"model": "gpt-4",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"question": "this is the question: {{last_user_message}}",
				"history": true,
				"citations": true
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "kb_success_namespace_as_name",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
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
			"intent_display_name": "kb_success_namespace_as_name_custom_attribute",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
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
			"intent_display_name": "kb_fail_missing_namespace",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
				"model": "gpt-4",
				"temperature": 0.7,
				"max_tokens": 1000,
				"namespace": "12345678",
				"top_k": 2,
				"context": "this is the context: {{custom_context}}",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"question": "this is the question: {{last_user_message}}",
				"advancedPrompt": true,
				"history": true,
				"namespaceAsName": false
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "kb_fail_missing_namespace_name",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
				"model": "gpt-4",
				"temperature": 0.7,
				"max_tokens": 1000,
				"namespace": "NotExists",
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
			"intent_display_name": "kb_success_advanced_context",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
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
			"language": "en",
			"intent_display_name": "kb_success_chunks_only",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
				"assignChunksTo": "kb_chunks",
				"namespace": "666708c13d20c7002d68fa90",
				"model": "gpt-4",
				"temperature": 0.7,
				"max_tokens": 1000,
				"top_k": 2,
				"chunks_only": true,
				"context": "this is the context: {{custom_context}}",
				"advancedPrompt": true,
				"trueIntent": "#SUCCESS_CHUNKS",
				"falseIntent": "#FAILURE",
				"question": "this is the question: {{last_user_message}}",
				"history": true
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "kb_success_hybrid_search",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionTitle": "gpt action",
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
				"assignChunksTo": "kb_chunks",
				"namespace": "12345678",
				"model": "gpt-4",
				"temperature": 0.7,
				"max_tokens": 1000,
				"top_k": 2,
				"alpha": 0.8,
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
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
				"model": "gpt-4",
				"question": "this is the question: {{last_user_message}}",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"history": true
			}],
			"language": "en",
			"intent_display_name": "kb_fail",
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
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
				"kbid": "kb1",
				"question": "",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"history": true
			}],
			"language": "en",
			"intent_display_name": "kb_fail_noquestion",
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
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
				"kbid": "",
				"question": "this is the question: {{last_user_message}}",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"history": true
			}],
			"language": "en",
			"intent_display_name": "kb_fail_nokbid",
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
							"text": "kb replied: {{kb_reply}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "kb intent true",
			"intent_id": "SUCCESS"
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
							"text": "kb replied: {{kb_chunks}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "kb intent chunks true",
			"intent_id": "SUCCESS_CHUNKS"
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
							"text": "kb replied: {{kb_reply}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "kb intent false",
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