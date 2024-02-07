// BOT TEST CASE CUSTOMERIO
const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [
		{
			// 204 SUCCESS
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "customerio#SUCCESS",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "customerio",
				"_tdActionId": "123456789",
				"token": "M432QRWRWQ%£53532QQEQEQEQ=",
				"formid":"1",
				"bodyParameters": {
					"email": "cool10.person@example.com",
					"first_name": "cool10",
					"last_name": "person10",
					"company": "studio10",
					"website":"miosito10"
				},
				"assignResultTo": "customerio_result",
				"assignStatusTo": "customerio_status",
				"assignErrorTo": "customerio_error",
				"_tdActionType": "customerio",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			},
			]
		},
		{
			// 409 CONTACT ALREADY EXIST
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "customerio#FAILURE409",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "customerio",
				"_tdActionId": "072d2d37-07f1-43e1-a4bf-7ddef62c2e2b",
				"token": "123456789",
				"formid": "1",
				"bodyParameters": {
					"inputs": [
					  {
						"properties": {
							"email": "email",
							"lastname": "lastname",
							"firstname": "firstname"
						},
						"associations": []
					  }
					]
				  },
				"assignResultTo": "customerio_result",
				"assignStatusTo": "customerio_status",
				"assignErrorTo": "customerio_error",
				"_tdActionType": "customerio",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			},
			]
		},
		{
			// 401 wrong Access token API
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "customerio#FAILUREACCESSTOKEN",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "customerio",
				"_tdActionId": "072d2d37-07f1-43e1-a4bf-7ddef62c2e2b",
				"token": "12345678910",
				"formid":"1",
				"bodyParameters": {
					"email": "email",
					"lastname": "lastname",
					"firstname": "firstname"
				},
				"assignResultTo": "customerio_result",
				"assignStatusTo": "customerio_status",
				"assignErrorTo": "customerio_error",
				"_tdActionType": "customerio",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			},
			]
		},
		{
			// 400 EMAIL IS INVALID
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "customerio#FAILUREEMAIL",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "customerio",
				"_tdActionId": "072d2d37-07f1-43e1-a4bf-7ddef62c2e2b",
				"token": "123456789",
				"bodyParameters": {
					"email": "email",
					"lastname": "lastname",
					"firstname": "firstname"
				},
				"assignResultTo": "customerio_result",
				"assignStatusTo": "customerio_status",
				"assignErrorTo": "customerio_error",
				"_tdActionType": "customerio",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			},
			]
		},
		{
			// TRUE INTENT - CUSTOMERIO SUCCESS
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
							"text": "customerio status is: ${customerio_status}"
						}
					},
					{
						"type": "message",
						"message": {
							"type": "text",
							"text": "customerio error is: ${customerio_error}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "customerio intent true",
			"intent_id": "SUCCESS",
		},
		{
			// FALSE INTENT - CUSTOMERIO FAIL
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
							"text": "customerio status is: ${customerio_status}"
						}
					},
					{
						"type": "message",
						"message": {
							"type": "text",
							"text": "customerio error is: ${customerio_error}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "customerio intent false",
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