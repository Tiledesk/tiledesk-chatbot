const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "JSON Condition test",
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
						"text": "Hi, how can I help you?",
						"attributes": {
							"attachment": {
								"type": "template",
								"buttons": [{
									"value": "/winning_path",
									"type": "text",
									"target": "blank",
									"link": "",
									"action": "",
									"show_echo": true
								}, {
									"value": "/losing_path",
									"type": "text",
									"target": "blank",
									"link": "",
									"action": "",
									"show_echo": true
								}, {
									"value": "/unknown_path",
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
		"intent_id": "47d74053-da5f-40fb-9357-fc72952a26d0"
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
		"intent_id": "d15bff15-ac12-4b9d-a90c-a8cd104325fc"
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
						"text": "You won!",
						"attributes": {
							"attachment": {
								"type": "template",
								"buttons": [{
									"value": "/start",
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
			"text": "You won!\r\n"
		}],
		"language": "en",
		"intent_display_name": "quiz_ok",
		"intent_id": "d19b1b7a-7146-481d-a7d5-6b9cce8fcb50"
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
						"text": "You lost!",
						"attributes": {
							"attachment": {
								"type": "template",
								"buttons": [{
									"value": "/start",
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
			"text": "You lost!\r\n"
		}],
		"language": "en",
		"intent_display_name": "quiz_failed",
		"intent_id": "16240c0b-9618-40cd-87e7-6319e5c3e392"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "score = 10",
			"_tdActionType": "setattribute",
			"operation": {
				operands: [
					{
						value: "10",
                    	isVariable: false
					}
				]
			},
			"destination": "score"
		}, {
			"_tdActionTitle": "eval_quiz",
			"_tdActionType": "intent",
			"intentName": "#b9202030-2f2c-40c9-9353-76c353f0c77a"
		}],
		"language": "en",
		"intent_display_name": "winning_path",
		"intent_id": "a6fb7d19-7464-4d5c-8d49-831b40f01c82"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "I don't know!",
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
						"text": "I don't know!",
						"attributes": {
							"attachment": {
								"type": "template",
								"buttons": [{
									"value": "/start",
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
			"text": "I don't know!\r\n"
		}],
		"language": "en",
		"intent_display_name": "quiz_unknown",
		"intent_id": "98dd1994-83ef-4863-8179-07c48d2194b9"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": null,
			"_tdActionType": "jsoncondition",
			"groups": [{
					"type": "expression",
					"conditions": [{
						"type": "condition",
						"operand1": "score",
						"operator": "equalAsNumbers",
						"operand2": {
							"type": "const",
							"value": "10",
							"name": ""
						}
					}]
			}],
			"stopOnConditionMet": true,
			"trueIntent": "#d19b1b7a-7146-481d-a7d5-6b9cce8fcb50"
		}, {
			"_tdActionTitle": null,
			"_tdActionType": "jsoncondition",
			"groups": [{
					"type": "expression",
					"conditions": [{
						"type": "condition",
						"operand1": "score",
						"operator": "lessThanOrEqual",
						"operand2": {
							"type": "const",
							"value": "5",
							"name": ""
						}
					}]
			}],
			"stopOnConditionMet": true,
			"trueIntent": "#16240c0b-9618-40cd-87e7-6319e5c3e392"
		}, {
			"_tdActionTitle": null,
			"_tdActionType": "jsoncondition",
			"groups": [{
					"type": "expression",
					"conditions": [{
						"type": "condition",
						"operand1": "score",
						"operator": "notEqualAsNumbers",
						"operand2": {
							"type": "const",
							"value": "5",
							"name": ""
						}
					}, {
						"type": "operator",
						"operator": "AND"
					}, {
						"type": "condition",
						"operand1": "score",
						"operator": "notEqualAsNumbers",
						"operand2": {
							"type": "const",
							"value": "10",
							"name": ""
						}
					}]
			}],
			
			"stopOnConditionMet": false,
			"trueIntent": "#98dd1994-83ef-4863-8179-07c48d2194b9"
		}],
		"language": "en",
		"intent_display_name": "eval_quiz",
		"intent_id": "b9202030-2f2c-40c9-9353-76c353f0c77a"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "nullooo",
			"_tdActionType": "setattribute",
			"operation": {
				operands: [
					{
						value: "5",
                    	isVariable: false
					}
				]
			},
			"destination": "score"
		}, {
			"_tdActionTitle": "eval_quiz",
			"_tdActionType": "intent",
			"intentName": "#b9202030-2f2c-40c9-9353-76c353f0c77a"
		}],
		"language": "en",
		"intent_display_name": "losing_path",
		"intent_id": "a38ba141-6803-4739-8f42-8029626d82c8"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "nulliizzooo",
			"_tdActionType": "setattribute",
			"operation": {
				operands: [
					{
						value: "7",
                    	isVariable: false
					}
				]
			},
			"destination": "score"
		}, {
			"_tdActionTitle": "eval_quiz",
			"_tdActionType": "intent",
			"intentName": "#b9202030-2f2c-40c9-9353-76c353f0c77a"
		}],
		"language": "en",
		"intent_display_name": "unknown_path",
		"intent_id": "e140705d-3a7c-4e0c-a30f-6242a668395e"
	}]
}

// // normalize the bot structure for the static intent search
// let intents = bot.intents;
// delete bot.intents;
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