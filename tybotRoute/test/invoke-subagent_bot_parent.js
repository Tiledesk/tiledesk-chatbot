// BOT TEST CASE MAKE
const { bots_data: subagent_bots_data } = require('./invoke-subagent_bot_sub');

const bot = { 
	"_id": "parent_bot_id",
	"webhook_enabled": false, 
	"language": "en", 
	"name": "Parent", 
	"slug": "parent", 
	"type": "tilebot", 
	"subtype": "chatbot", 
	"intents": [
		// START
		{ 
			"webhook_enabled": false, 
			"enabled": true, 
			"actions": [
				{ 
					"_tdActionType": "intent", 
					"intentName": "#e22ed83c-066b-4ee6-bec5-a65e1c005e34" 
				}
			], 
			"id_faq_kb": "69fdd84e94c456001308f246", 
			"intent_id": "aa98e203-905a-497b-b0cd-9ab49978ff4d", 
			"question": "\\start", 
			"intent_display_name": "start", 
			"language": "en", 
			"attributes": { 
				"position": { "x": 172, "y": 384 } 
			}, 
			"agents_available": false 
		},

		// WELCOME
		{ 
			"webhook_enabled": false, 
			"enabled": true, 
			"actions": [
				{ 
					"_tdActionType": "reply", 
					"attributes": { 
						"disableInputMessage": false, 
						"commands": [
							{ 
								"type": "wait", 
								"time": 500 
							}, 
							{ 
								"type": "message", 
								"message": { 
									"type": "text", 
									"text": "Hi, how can I help you?" 
								} 
							}
						] 
					}, 
					"text": "Hi, how can I help you?\r\n" 
				}
			], 
			"id_faq_kb": "69fdd84e94c456001308f246", 
			"intent_id": "e22ed83c-066b-4ee6-bec5-a65e1c005e34", 
			"intent_display_name": "welcome", 
			"language": "en", 
			"attributes": {
				"position": { "x": 1660, "y": 507.5 },
				"nextBlockAction": {
					"_tdActionId": "#SUBAGENT_INTENT",
					"_tdActionType": "intent",
					"intentName": "#SUBAGENT_INTENT"
				},
				"connectors": {},
				"color": "156,163,205",
				"readonly": false
			},
			"agents_available": false 
		},

		// SUBAGENT
		{
			"webhook_enabled": false, 
			"enabled": true,
			"actions": [
				{
					"_tdActionType": "invoke_subagent",
					"intentName": "#0d9dd162-5882-4da0-a898-41d209652534",
					"subagent_id": "subagent_bot_id",
					"awaitWebhookPublish": true,
					"trueIntent": "#SUCCESS",
					// "falseIntent": "#FAILURE",
					"assignResultTo": "subagent_result",
				}
			],
			"id_faq_kb": "69fdd84e94c456001308f246",
			"intent_id": "SUBAGENT_INTENT",
		},
		// TRUE INTENT
		{
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
							"text": "Subagent reply with result: {{subagent_result}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "subagent intent true",
			"intent_id": "SUCCESS"
		},

		// FALSE INTENT
		// {
		// 	"webhook_enabled": false,
		// 	"enabled": true,
		// 	"actions": [{
		// 		"_tdActionType": "reply",
		// 		"text": "xxx",
		// 		"attributes": {
		// 			"commands": [{
		// 				"type": "wait",
		// 				"time": 500
		// 			}, {
		// 				"type": "message",
		// 				"message": {
		// 					"type": "text",
		// 					"text": "Subagent reply with error: {{flowError}}"
		// 				}
		// 			}]
		// 		}
		// 	}],
		// 	"language": "en",
		// 	"intent_display_name": "subagent intent false",
		// 	"intent_id": "FAILURE"
		// },

		// DEFAULT FALLBACK
		{ 
			"webhook_enabled": false, 
			"enabled": true, 
			"actions": [
				{ 
					"_tdActionType": "reply", 
					"text": "I didn't understand. Can you rephrase your question?", 
					"attributes": { 
						"commands": [
							{ 
								"type": "wait", 
								"time": 500 
							}, 
							{ 
								"type": "message", 
								"message": { 
									"type": "text", 
									"text": "I didn't understand. Can you rephrase your question?" 
								} 
							}
						] 
					} 
				}
			], 
			"id_faq_kb": "69fdd84e94c456001308f246", 
			"intent_id": "8da6d28d-cab9-4492-9888-3109ea77a0b8",
			"intent_display_name": "defaultFallback", 
			"language": "en", 
			"attributes": { 
				"position": { "x": 714, "y": 528 } 
			}, 
			"agents_available": false 
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
bots_data.bots["subagent_bot_id"] = subagent_bots_data.bots["botID"];

module.exports = { bots_data: bots_data };