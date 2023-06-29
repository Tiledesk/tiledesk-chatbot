const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "mybot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "reply",
			"text": "Hi, how can I help you?\r\n",
			"attributes": {
				"commands": [{
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Hi, how can I help you?"
					}
				}]
			}
		}],
		"question": "\\start",
		"intent_display_name": "start",
		"language": "en",
		"intent_id": "53f04f7c-bcb4-46b8-babe-8a048f9a4656"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "reply",
			"text": "I didn't understand. Can you rephrase your question?",
			"attributes": {
				"commands": [{
					"type": "message",
					"message": {
						"type": "text",
						"text": "I didn't understand. Can you rephrase your question?"
					}
				}]
			}
		}],
		"question": "defaultFallback",
		"intent_display_name": "defaultFallback",
		"language": "en",
		"intent_id": "e226ab42-4697-483a-b142-2474eb46a4a5"
	}]
}

// normalize the bot structure for the static intent search
let intents = bot.intents;
delete bot.intents;
// console.log ("bot still is", JSON.stringify(bot));
// console.log ("bintents still are", intents[0]);
intent_dict = {};
for (let i = 0; i < intents.length; i++) {
  intent_dict[intents[i].intent_display_name] = intents[i];
}
bot.intents = intent_dict;
const bots_data = {
  "bots": {}
}
bots_data.bots["botID"] = bot;

module.exports = { bots_data: bots_data };