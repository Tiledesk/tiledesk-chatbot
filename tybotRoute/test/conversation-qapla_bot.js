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
		"intent_display_name": "qapla#SUCCESS",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionType": "qapla",
			"_tdActionTitle": "qapla action",
			"trackingNumber": "tracking_number",
			"apiKey": "my_qapla_api_key",
			"assignStatusTo": "qapla_status",
			"assignErrorTo": "qapla_error",
			"assignResultTo": "qapla_result",
		},
		{
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
						"text": "qapla status is: ${qapla_status}"
					}
				},
				{
					"type": "message",
					"message": {
						"type": "text",
						"text": "qapla result is: ${qapla_result}"
					}
				},
				{
					"type": "message",
					"message": {
						"type": "text",
						"text": "qapla error is: ${qapla_error}"
					}
				}]
			}
		}]
	},
	{
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "qapla#FAILURE",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionType": "qapla",
			"_tdActionTitle": "qapla action",
			"trackingNumber": "abcd1234",
			"apiKey": "my_qapla_api_key",
			"assignStatusTo": "qapla_status",
			"assignErrorTo": "qapla_error",
			"assignResultTo": "qapla_result",
		},
		{
			"_tdActionType": "reply",
			"text": "xxx",
			"attributes": {
				"commands": [{
					"type": "wait",
					"time": 500
				},
				{
					"type": "message",
					"message": {
						"type": "text",
						"text": "qapla result is: ${qapla_result}"
					}
				},
				{
					"type": "message",
					"message": {
						"type": "text",
						"text": "qapla error is: ${qapla_error}"
					}
				}]
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