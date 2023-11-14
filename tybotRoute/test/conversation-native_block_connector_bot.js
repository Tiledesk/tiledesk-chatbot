const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "native block connector",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [],
		"intent_display_name": "start",
		"language": "en",
		"intent_id": "72d059bc-b2cb-4629-9ce0-36f602a22479",
		"attributes": {
			"nextBlockAction": {
				"_tdActionType": "intent",
				"intentName": "#00000000-0000-0000-0000-000000000000"
			}
		}
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "reply",
			"text": "Hi",
			"attributes": {
				"commands": [{
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Block connected!"
					}
				}]
			}
		}],
		"question": "\\start",
		"intent_display_name": "second_block",
		"language": "en",
		"intent_id": "00000000-0000-0000-0000-000000000000"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "",
			"_tdActionId": "fe9bff7c-9712-4769-b123-80e7767cb134",
			"_tdActionType": "setattribute",
			"operation": {
				"operands": [{
					"value": "value1",
					"isVariable": false
				}],
				"operators": []
			},
			"destination": "var1"
		}],
		"language": "en",
		"intent_display_name": "set_attribute",
		"intent_id": "1-1-1-1-1",
		"attributes": {
			"nextBlockAction": {
				"_tdActionType": "intent",
				"intentName": "#00000000-0000-0000-0000-000000000000"
			}
		}
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