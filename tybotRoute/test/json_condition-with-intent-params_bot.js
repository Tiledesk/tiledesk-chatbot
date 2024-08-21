const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Link Button",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "reply",
			"text": "Start\r\n",
			"attributes": {
				"commands": [{
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Start",
						"attributes": {
							"attachment": {
								"type": "template",
								"buttons": [{
									"value": "/condition with params{\"star_type\":\"supernova\"}",
									"type": "text",
									"target": "blank",
									"link": "",
									"action": "",
									"show_echo": true
								}, {
									"value": "/condition with params{\"star_type\":\"nebula\"}",
									"type": "text",
									"target": "blank",
									"link": "",
									"action": "",
									"show_echo": true
								}]
							}
						}
					}
				}]
			},
			"_tdActionTitle": null
		}],
		"question": "\\start",
		"intent_display_name": "start",
		"language": "en",
		"intent_id": "550a5f10-f161-43d1-a308-97576797d54d"
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
		"intent_id": "543f9b38-376a-447b-ba9c-dda4cae91cd9"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "star_type === supernova",
			"_tdActionType": "jsoncondition",
			"groups": [{
				"type": "expression",
				"conditions": [{
					"type": "condition",
					"operand1": "{{star_type}}",
					"operator": "equalAsStrings",
					"operand2": {
						"type": "const",
						"value": "supernova",
						"name": ""
					}
				}]
			}],
			"stopOnConditionMet": false,
			"trueIntent": "#1ccbf281-ea62-4567-a481-c1cc48266168",
			"falseIntent": "#1ccbf281-ea62-4567-a481-c1cc48266168",
			"trueIntentAttributes": {
				"my_name": "supernova",
				"size": "2B"
			},
			"falseIntentAttributes": {
				"my_name": "nebula",
				"size": "500k"
			}
		}],
		"language": "en",
		"intent_display_name": "condition with params",
		"intent_id": "e538b93d-47e7-4888-8f23-e10f878ac901"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": null,
			"_tdActionType": "setattribute",
			"expression": "?",
			"assignTo": "star_type"
		}],
		"language": "en",
		"intent_display_name": "variables declaration",
		"intent_id": "f629c3ab-b317-486d-802f-e7e458a4c839"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": null,
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
						"text": "My name is ${my_name} and I'm ${size} km large"
					}
				}]
			},
			"text": "My name is ${my_name} and I'm ${size} km large\r\n"
		}],
		"language": "en",
		"intent_display_name": "result",
		"intent_id": "1ccbf281-ea62-4567-a481-c1cc48266168"
	}]
}

// // normalize the bot structure for the static intent search
// let intents = bot.intents;
// delete bot.intents;
// // console.log ("bot still is", JSON.stringify(bot));
// // console.log ("bintents still are", intents[0]);
// intent_dict = {};
// for (let i = 0; i < intents.length; i++) {
//   intent_dict[intents[i].intent_display_name] = intents[i];
//   intent_dict["#" + intents[i].intent_id] = intents[i];
// }
// bot.intents = intent_dict;
// const bots_data = {
//   "bots": {}
// }
// bots_data.bots["botID"] = bot;
// module.exports = { bots_data: bots_data };

// normalize the bot structure for the static intent search
let intents = bot.intents;
delete bot.intents;
// console.log ("bot still is", JSON.stringify(bot));
// console.log ("bintents still are", intents[0]);
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