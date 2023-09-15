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
		"intent_display_name": "gpt task",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionType": "gpt_task",
			"_tdActionTitle": "gpt action",
			"assignReplyTo": "gpt_reply",
			"question": "this is the question",
			"context": "you are an awesome assistant",
			"max_tokens": 100,
			"temperature": 0,
			"model": "gpt-3.5-turbo"
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
						"text": "gpt replied: ${gpt_reply}"
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