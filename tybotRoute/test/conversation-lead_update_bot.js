// BOT TEST CASE LEAD UPDATE
const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [
		{
			// 200 SUCCESS
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "leadUpdate#SUCCESS",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "lead_update",
				"_tdActionId": "072d2d37-07f1-43e1-a4bf-7ddef62c2e2b",
				"_tdActionType": "lead_update",
				"fullname": "{{fullname}}",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			},
			{
				"_tdActionType": "reply",
				"text": "xxx",
				"attributes": {
					"commands": [{
						"type": "wait",
						"time": 500
					}, 
					{
						"type": "message",
						"message": {
							"type": "text",
							"text": "lead_update lead_fullname: {{fullname}}",
						}
					}]
				}
			}]
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