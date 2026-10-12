const bot = {
	"webhook_enabled": true,
	"webhook_url": "http://127.0.0.1:10002/bot",
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [
	{
		"webhook_enabled": true,
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
						"text": "placeholder reply"
					}
				}]
			}
		}],
		"language": "en",
		"intent_display_name": "webhook",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
		"form": null,
		"question": ""
	}]
}

// normalize the bot structure for the static intent search
let intents = bot.intents;
delete bot.intents;
intent_dict = {};
for (let i = 0; i < intents.length; i++) {
  intent_dict[intents[i].intent_display_name] = intents[i];
  intent_dict["#" + intents[i].intent_id] = intents[i];
}
bot.intents = intent_dict;
const bots_data = {
  "bots": {}
}
bots_data.bots["botID"] = bot;
module.exports = { bots_data: bots_data };