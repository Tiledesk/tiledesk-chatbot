// BOT TEST CASE BREVO
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
			"intent_display_name": "brevo#SUCCESS",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "brevo",
				"_tdActionId": "123456789",
				"bodyParameters": {
					"email": "elly@example62.com",
					"FIRSTNAME": "Ellya",
					"LASTNAME":"Ninas",
    				"SMS":"+393264347637",
				
					"emailBlacklisted": false,
					"smsBlacklisted": false,
					"listIds": [
					  21
					],
					"updateEnabled": false,
					"smtpBlacklistSender": [
					  "info@sendinblue.com"
					]
				  },
				"assignResultTo": "brevo_result",
				"assignStatusTo": "brevo_status",
				"assignErrorTo": "brevo_error",
				"_tdActionType": "brevo",
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
			"intent_display_name": "brevo#FAILUREACCESSTOKEN",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "brevo",
				"_tdActionId": "072d2d37-07f1-43e1-a4bf-7ddef62c2e2b",
				"bodyParameters": {
					"email": "elly@example1.com",
					"attributes": {
					  "FIRSTNAME": "Elly",
					  "LASTNAME":"Nina",
    				  "SMS":"+39332249843"
					},
					"emailBlacklisted": false,
					"smsBlacklisted": false,
					"listIds": [
					  21
					],
					"updateEnabled": false,
					"smtpBlacklistSender": [
					  "info@sendinblue.com"
					]
				  },
				"assignResultTo": "brevo_result",
				"assignStatusTo": "brevo_status",
				"assignErrorTo": "brevo_error",
				"_tdActionType": "brevo",
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
			"intent_display_name": "brevo#FAILUREEMAIL",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "brevo",
				"_tdActionId": "072d2d37-07f1-43e1-a4bf-7ddef62c2e2b",
				"bodyParameters": {
					"email": "ellyexample1.com",
					"attributes": {
					  "FIRSTNAME": "Elly",
					  "LASTNAME":"Nina",
    				  "SMS":"+393322349843"
					},
					"emailBlacklisted": false,
					"smsBlacklisted": false,
					"listIds": [
					  21
					],
					"updateEnabled": false,
					"smtpBlacklistSender": [
					  "info@sendinblue.com"
					]
				  },
				"assignResultTo": "brevo_result",
				"assignStatusTo": "brevo_status",
				"assignErrorTo": "brevo_error",
				"_tdActionType": "brevo",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			},
			]
		},
		{
			// 400 CONTACT ALREADY EXIST
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "brevo#FAILUREDOUBLECONTACT",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "brevo",
				"_tdActionId": "072d2d37-07f1-43e1-a4bf-7ddef62c2e2b",
				"bodyParameters": {
					"email": "elly@example1.com",
					"attributes": {
					  "FIRSTNAME": "Elly",
					  "LASTNAME":"Nina",
    				  "SMS":"+393322349843"
					},
					"emailBlacklisted": false,
					"smsBlacklisted": false,
					"listIds": [
					  21
					],
					"updateEnabled": false,
					"smtpBlacklistSender": [
					  "info@sendinblue.com"
					]
				  },
				"assignResultTo": "brevo_result",
				"assignStatusTo": "brevo_status",
				"assignErrorTo": "brevo_error",
				"_tdActionType": "brevo",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			},
			]
		},
		{
			// TRUE INTENT - brevo SUCCESS
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
							"text": "brevo status is: ${brevo_status}"
						}
					},{
						"type": "message",
						"message": {
							"type": "text",
							"text": "brevo result is: ${brevo_result}"
						}
					},
					{
						"type": "message",
						"message": {
							"type": "text",
							"text": "brevo error is: ${brevo_error}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "brevo intent true",
			"intent_id": "SUCCESS"
		},
		{
			// FALSE INTENT - brevo FAIL
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
							"text": "brevo status is: ${brevo_status}"
						}
					},{
						"type": "message",
						"message": {
							"type": "text",
							"text": "brevo result is: ${brevo_result}"
						}
					},
					{
						"type": "message",
						"message": {
							"type": "text",
							"text": "brevo error is: ${brevo_error}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "brevo intent false",
			"intent_id": "FAILURE"
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