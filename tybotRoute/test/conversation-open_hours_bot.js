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
			"intent_display_name": "operating_hours",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [
				{
					"_tdActionTitle": "if_open_hours",
					"stopOnConditionMet": true,
					"_tdActionType": "ifopenhours",
					"trueIntent": "#SUCCESS",
					"falseIntent": "#FAILURE"
				}],
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "custom_slot",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [
				{
					"_tdActionTitle": "if_open_hours",
					"stopOnConditionMet": true,
					"_tdActionType": "ifopenhours",
					"slotId": 'slotID',
					"trueIntent": "#SUCCESS",
					"falseIntent": "#FAILURE"
				}],
		},
		{
			// TRUE INTENT
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
							"text": "open"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "operating hours intent true",
			"intent_id": "SUCCESS"
		},
		{
			// FALSE INTENT
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
							"text": "closed"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "operating hours intent false",
			"intent_id": "FAILURE"
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

// // normalize the bot structure for the static intent search
// let intents = bot.intents;
// delete bot.intents;
// intent_dict = {};
// for (let i = 0; i < intents.length; i++) {
// 	intent_dict[intents[i].intent_display_name] = intents[i];
// 	intent_dict["#" + intents[i].intent_id] = intents[i];
// }
// bot.intents = intent_dict;
// const bots_data = {
// 	"bots": {}
// }
// bots_data.bots["botID"] = bot;
module.exports = { bots_data: bots_data };