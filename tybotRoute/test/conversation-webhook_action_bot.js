const bot = {
	"webhook_enabled": false,
	"name": "Automation bot",
	"type": "tilebot",
	"intents": [
	{
		"actions": [{
			"_tdActionType": "webresponse",
			"status": 200,
      		"payload": {
				"type": "B",
				"size": "M",
				"height": 200
			},
		}],
		"intent_display_name": "webhook response",
		"intent_id": "webhook-block-4d7ad6ed-57dc-4dbe-9570-83e693b562e8"
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

// becasue of exact search match
bots_data.bots["botID"].questions_intent = {
    "no button text => no match": "no button text => no match"
}

module.exports = { bots_data: bots_data };