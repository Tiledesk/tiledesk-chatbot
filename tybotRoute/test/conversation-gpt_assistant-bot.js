const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "GPT Assistant",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "returns a message from a GPT Assistant",
			"prompt": "how many products do you have in the catalog?",
			"assistantId": "asst_lAzV6hFmw4YJVHcIqgt1CGxg",
			"threadIdAttribute": "firstThread",
			"assignResultTo": "assistantReply",
			"assignErrorTo": "assistantError",
			"_tdActionType": "gpt_assistant",
			"trueIntent": "#SUCCESS",
			"falseIntent": "#FAILURE"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "GPT Assistant reply",
		"intent_id": "SUCCESS",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "reply success",
			"_tdActionType": "reply",
			"attributes": {
				"disableInputMessage": false,
				"commands": [{
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "{{assistantReply}}"
					}
				}]
			},
			"text": "..."
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