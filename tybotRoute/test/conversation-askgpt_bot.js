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
		"intent_display_name": "gpt success",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionType": "askgpt",
			"_tdActionTitle": "gpt action",
			"assignReplyTo": "gpt_reply",
			"assignSourceTo": "gpt_source",
			"kbid": "XXX",
			"trueIntent": "#SUCCESS",
			"falseIntent": "#FAILURE",
			"question": "this is the question: ${last_user_message}"
		}]
	},
	{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "askgpt",
			"_tdActionTitle": "gpt action failed",
			"assignReplyTo": "gpt_reply",
			"assignSourceTo": "gpt_source",
			"kbid": "kb1",
			"question": "this is the question: ${last_user_message}",
			"trueIntent": "#SUCCESS",
			"falseIntent": "#FAILURE",
		}],
		"language": "en",
		"intent_display_name": "gpt fail",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
		"form": {},
		"question": ""
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
						"text": "gpt replied: ${gpt_reply}"
					}
				}]
			}
		}],
		"language": "en",
		"intent_display_name": "gpt intent true",
		"intent_id": "SUCCESS",

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
						"text": "gpt replied: {{gpt_reply}}"
					}
				}]
			}
		}],
		"language": "en",
		"intent_display_name": "gpt intent false",
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