const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "8fb872b7-e71a-4b1d-8537-36febe72cd24",
					"_tdActionType": "custom_reply",
					"custom_json": "{\"type\":\"text\",\"text\":\"Hi, how can I help you?\"}"
				}
			],
			"intent_id": "2a08f448-ab0c-4149-8776-fe7d145a8733",
			"intent_display_name": "custom reply",
			"language": "en"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "8fb872b7-e71a-4b1d-8537-36febe72cd24",
					"_tdActionType": "custom_reply",
					"custom_json": "{type\":\"text\",\"text\":\"Hi, how can I help you?}"
				}
			],
			"intent_id": "2a08f448-ab0c-4149-8776-fe7d145a8733",
			"intent_display_name": "wrong json custom reply",
			"language": "en"
		}
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