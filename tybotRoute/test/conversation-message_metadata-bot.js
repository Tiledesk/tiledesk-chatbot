const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "basic_reply_showing_metadata",
		"intent_id": "basic_reply_showing_metadata",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "reply check action",
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
						"text": "message type: {{lastUserMessage.type}} message text: {{lastUserMessage.text}} message.metadata.src: {{lastUserMessage.metadata.src}}"
					}
				}]
			},
			"text": "..."
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"intent_display_name": "condition with json metadata",
		"intent_id": "condition with json metadata",
		"actions": [{
			"_tdActionTitle": null,
			"_tdActionType": "jsoncondition",
			"groups": [{
				"type": "expression",
				"conditions": [{
					"type": "condition",
					"operand1": "{{lastUserMessage.type}}",
					"operator": "equalAsStrings",
					"operand2": {
						"type": "const",
						"value": "image",
						"name": ""
					}
				}]
			}],
			"stopOnConditionMet": true,
			"trueIntent": "trueIntent1"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "trueIntent1",
		"intent_id": "trueIntent1",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "reply check action",
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
						"text": "it's true"
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