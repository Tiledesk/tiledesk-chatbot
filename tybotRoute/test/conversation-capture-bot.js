const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "capture1",
		"intent_id": "capture1_intent",
		"actions": [{
			"_tdActionType": "reply",
			"_tdActionId": "0001",
			"text": "your name?",
			"attributes": {
				"commands": [{
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "your name?"
					}
				}]
			}
		},
		{
			"_tdActionType": "capture",
			"_tdActionId": "0002",
			"goToIntent": "capture_end",
			"assignResultTo": "username"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "capture_end",
		"intent_id": "capture_end",
		"actions": [{
			"_tdActionType": "reply",
			"_tdActionId": "0003",
			"text": "It's a good form...",
			"attributes": {
				"commands": [{
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "It's a good form {{username}}"
					}
				}]
			}
		}]
	}]
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