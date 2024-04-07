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
			"intent_display_name": "n8n#SUCCESS",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "n8n",
				"_tdActionId": "123456789",
				"bodyParameters": {
                    "name": "Ellya",
                    "class":"1A",
					"mail": "elly@example62.com"
				  },
                "url" : "1234",
				"assignResultTo": "n8n_result",
				"assignStatusTo": "n8n_status",
				"assignErrorTo": "n8n_error",
				"_tdActionType": "n8n",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			},
			]
		},
		{
			// TRUE INTENT - n8n SUCCESS
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
							"text": "n8n status is: ${n8n_status}"
						}
					},{
						"type": "message",
						"message": {
							"type": "text",
							"text": "n8n result is: ${n8n_result}"
						}
					},
					{
						"type": "message",
						"message": {
							"type": "text",
							"text": "n8n error is: ${n8n_error}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "n8n intent true",
			"intent_id": "SUCCESS"
		},
		{
			// FALSE INTENT - n8n FAIL
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
							"text": "n8n status is: ${n8n_status}"
						}
					},{
						"type": "message",
						"message": {
							"type": "text",
							"text": "n8n result is: ${n8n_result}"
						}
					},
					{
						"type": "message",
						"message": {
							"type": "text",
							"text": "n8n error is: ${n8n_error}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "n8n intent false",
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