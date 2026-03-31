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
			"intent_display_name": "iteration",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "iteration",
				"_tdActionTitle": "iteration",
				"_tdActionId": "1c4a7a0d-02fa-4fe1-9787-e2839bd0ee21",
				"goToIntent": "#00f93b97-89ee-466d-a09c-e47a18943058",
				"iterable": "iterable_varname",
				"assignOutputTo": "output",
				"delay": 5
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "output_reply",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943058",
			"form": {},
			"question": "",
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
							"text": "{{output}}"
						}
					}]
				}
			}],
			"attributes": {
				"position": {
					"x": 1111,
					"y": 199
				},
				"nextBlockAction": {
					"_tdActionType": "intent",
					"intentName": "#00f93b97-89ee-466d-a09c-e47a18943057"
				}
			}
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