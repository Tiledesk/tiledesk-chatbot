// BOT TEST CASE MAKE
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
			"intent_display_name": "make#SUCCESS",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "make",
				"_tdActionId": "072d2d37-07f1-43e1-a4bf-7ddef62c2e2b",
				"url": "http://localhost:10002/1ag9ub5cm8gaiyrlosuxcfv5bv4gupg1",
				"bodyParameters": {
					"name": "userFullname",
					"email": "userEmail"
				},
				"assignStatusTo": "make_status",
				"assignErrorTo": "make_error",
				"_tdActionType": "make",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			},
			]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "make#FAILURE",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "make",
				"_tdActionId": "072d2d37-07f1-43e1-a4bf-7ddef62c2e2b",
				"url": "http://localhost:10002/1ag9ub5cm8gaiyrlosuxcfv5bv4gupg1",
				"bodyParameters": {
					"name": "userFullname",
					"email": "userEmail"
				},
				"assignStatusTo": "make_status",
				"assignErrorTo": "make_error",
				"_tdActionType": "make",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			},
			]
		},
		{
			// 422 MISSING URL
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "make#FAILUREURL",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "make",
				"_tdActionId": "072d2d37-07f1-43e1-a4bf-7ddef62c2e2b",
				"url": "",
				"bodyParameters": {
					"name": "userFullname",
					"email": "userEmail"
				},
				"assignStatusTo": "make_status",
				"assignErrorTo": "make_error",
				"_tdActionType": "make",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			},
			]
		},
		{
			// TRUE INTENT - MAKE SUCCESS
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
							"text": "make status is: {{make_status}}"
						}
					},
					{
						"type": "message",
						"message": {
							"type": "text",
							"text": "make error is: {{make_error}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "make intent true",
			"intent_id": "SUCCESS",
		},
		{
			// FALSE INTENT - MAKE FAIL
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
							"text": "make status is: {{make_status}}"
						}
					},
					{
						"type": "message",
						"message": {
							"type": "text",
							"text": "make error is: {{make_error}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "make intent false",
			"intent_id": "FAILURE",

		},
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