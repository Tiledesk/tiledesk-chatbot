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
			"intent_display_name": "iteration",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "iteration",
				"_tdActionTitle": "iteration",
				"_tdActionId": "1c4a7a0d-02fa-4fe1-9787-e2839bd0ee21",
				"goToIntent": "#00f93b97-89ee-466d-a09c-e47a18943058",
				"iterable": "iterable_varname",
				"assignOutputTo": "output",
				"delay": 5
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "output_reply",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943058",
			"form": {},
			"question": "",
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
							"text": "{{output}}"
						}
					}]
				}
			}],
			"attributes": {
				"position": {
					"x": 1111,
					"y": 199
				},
				"nextBlockAction": {
					"_tdActionType": "intent",
					"intentName": "#00f93b97-89ee-466d-a09c-e47a18943057"
				}
			}
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

// Lo stesso bot, V3, con il blocco "when the list is done" (`fallbackIntent`, 14/10/2026): dopo
// l'ultimo elemento, o con una lista vuota, il motore esegue quel blocco. Il gemello senza
// etichetta V3 (la console V2 mostra lo stesso campo) lo ignora come sempre.
const DONE_ID = "00f93b97-89ee-466d-a09c-e47a18943059";
const fallbackBot = JSON.parse(JSON.stringify(bot));
fallbackBot.attributes = { "dsVersion": "v3" };
fallbackBot.intents["iteration"].actions[0].fallbackIntent = "#" + DONE_ID;
fallbackBot.intents_by_intent_id[fallbackBot.intents["iteration"].intent_id] = fallbackBot.intents["iteration"];
const doneBlock = {
	"webhook_enabled": false, "enabled": true, "language": "en",
	"intent_display_name": "done_reply", "intent_id": DONE_ID, "form": {}, "question": "",
	"actions": [{
		"_tdActionType": "reply", "text": "Done",
		"attributes": { "commands": [{ "type": "wait", "time": 100 }, { "type": "message", "message": { "type": "text", "text": "Done" } }] }
	}]
};
fallbackBot.intents["done_reply"] = doneBlock;
fallbackBot.intents_by_intent_id[DONE_ID] = doneBlock;
bots_data.bots["fallbackBotID"] = fallbackBot;
const fallbackV2Bot = JSON.parse(JSON.stringify(fallbackBot));
delete fallbackV2Bot.attributes;
bots_data.bots["fallbackV2BotID"] = fallbackV2Bot;

module.exports = { bots_data: bots_data };