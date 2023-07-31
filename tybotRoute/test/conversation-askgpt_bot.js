const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [
	{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "askgpt",
			"_tdActionTitle": "gpt action",
			"assignReplyTo": "gpt_reply",
			"assignSourceTo": "gpt_source",
			"assignSuccessTo": "gpt_success",
			"gptkey": "${gpt_key}",
			"kbid": "${gpt_key}",
			"question": "this is the question: ${last_user_message}"
		}, {
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
		"intent_display_name": "gpt success",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
		"form": {},
		"question": ""
	},
	{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "askgpt",
			"_tdActionTitle": "gpt action failed",
			"assignReplyTo": "gpt_reply",
			"assignSourceTo": "gpt_source",
			"assignSuccessTo": "gpt_success",
			"gptkey": "xxx",
			"kbid": "kb1",
			"question": "this is the question: ${last_user_message}"
		}, {
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
		"intent_display_name": "gpt fail",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
		"form": {},
		"question": ""
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
  intent_dict["#" + intents[i].intent_id] = intents[i];
}
bot.intents = intent_dict;
const bots_data = {
  "bots": {}
}
bots_data.bots["botID"] = bot;

module.exports = { bots_data: bots_data };