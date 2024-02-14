// BOT TEST CASE HUBSPOT
const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [
		{
			// 201 SUCCESS
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "hubspot#SUCCESS",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "hubspot",
				"_tdActionId": "123456789",
				"token": "pat-eu3-55dss34d-3334-5435-g156-h22e33247244",
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
				"assignResultTo": "hubspot_result",
				"assignStatusTo": "hubspot_status",
				"assignErrorTo": "hubspot_error",
				"_tdActionType": "hubspot",
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
			"intent_display_name": "hubspot#FAILURE409",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "hubspot",
				"_tdActionId": "072d2d37-07f1-43e1-a4bf-7ddef62c2e2b",
				"token": "123456789",
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
				"assignResultTo": "hubspot_result",
				"assignStatusTo": "hubspot_status",
				"assignErrorTo": "hubspot_error",
				"_tdActionType": "hubspot",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			},
			]
		},
		{
			// 401 wrong Access token
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "hubspot#FAILUREACCESSTOKEN",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "hubspot",
				"_tdActionId": "072d2d37-07f1-43e1-a4bf-7ddef62c2e2b",
				"token": "12345678910",
				"bodyParameters": {
					"email": "email",
					"lastname": "lastname",
					"firstname": "firstname"
				},
				"assignResultTo": "hubspot_result",
				"assignStatusTo": "hubspot_status",
				"assignErrorTo": "hubspot_error",
				"_tdActionType": "hubspot",
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
			"intent_display_name": "hubspot#FAILUREEMAIL",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "hubspot",
				"_tdActionId": "072d2d37-07f1-43e1-a4bf-7ddef62c2e2b",
				"token": "123456789",
				"bodyParameters": {
					"email": "email",
					"lastname": "lastname",
					"firstname": "firstname"
				},
				"assignResultTo": "hubspot_result",
				"assignStatusTo": "hubspot_status",
				"assignErrorTo": "hubspot_error",
				"_tdActionType": "hubspot",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			},
			]
		},
		{
			// TRUE INTENT - HUBSPOT SUCCESS
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
							"text": "hubspot status is: ${hubspot_status}"
						}
					},{
						"type": "message",
						"message": {
							"type": "text",
							"text": "hubspot result is: ${hubspot_result}"
						}
					},{
						"type": "message",
						"message": {
							"type": "text",
							"text": "hubspot error is: ${hubspot_error}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "hubspot intent true",
			"intent_id": "SUCCESS",
		},
		{
			// FALSE INTENT - HUBSPOT FAIL
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
							"text": "hubspot status is: ${hubspot_status}"
						}
					},{
						"type": "message",
						"message": {
							"type": "text",
							"text": "hubspot result is: ${hubspot_result}"
						}
					},
					{
						"type": "message",
						"message": {
							"type": "text",
							"text": "Hubspot error is: ${hubspot_error}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "hubspot intent false",
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