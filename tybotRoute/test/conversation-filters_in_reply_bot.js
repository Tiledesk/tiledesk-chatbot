const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Filter bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "reply",
			"text": "Italian\r\nEnglish\r\n",
			"attributes": {
				"commands": [{
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Italian",
						"_tdJSONCondition": {
							"type": "expression",
							"conditions": [{
								"type": "condition",
								"operand1": "user_language",
								"operator": "equalAsStrings",
								"operand2": {
									"type": "const",
									"value": "it",
									"name": ""
								}
							}]
						}
					}
				}, {
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "English",
						"_tdJSONCondition": {
							"type": "expression",
							"conditions": [{
								"type": "condition",
								"operand1": "user_language",
								"operator": "equalAsStrings",
								"operand2": {
									"type": "const",
									"value": "en",
									"name": ""
								}
							}]
						}
					}
				}]
			}
		}],
		"question": "\\start",
		"intent_display_name": "start",
		"language": "en",
		"intent_id": "72d059bc-b2cb-4629-9ce0-36f602a22479"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "reply",
			"text": "Hey this is Jovana!!\r\nDon't mean to intrude, but I got a fun fact query for you!\r\nProactive chatbots on your website help you **increase your conversion rate** massively.\r\nCiao 👋 Jovana qui!\r\nHo un mini quiz per te!\r\nI chatbot proattivi sul tuo sito aiutano a aumentare notevolmente **il tuo tasso di conversione**\r\n",
			"attributes": {
				"commands": [{
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Hey this is Jovana!",
						"_tdJSONCondition": {
							"type": "expression",
							"conditions": [{
								"type": "condition",
								"operand1": "user_language",
								"operator": "notEqualAsStrings",
								"operand2": {
									"type": "const",
									"value": "it",
									"name": ""
								}
							}]
						}
					}
				}, {
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Don't mean to intrude, but I got a fun fact query for you!",
						"_tdJSONCondition": {
							"type": "expression",
							"conditions": [{
								"type": "condition",
								"operand1": "user_language",
								"operator": "notEqualAsStrings",
								"operand2": {
									"type": "const",
									"value": "it",
									"name": ""
								}
							}]
						}
					}
				}, {
					"type": "wait",
					"time": 1500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Proactive chatbots on your website help you **increase your conversion rate** massively.",
						"attributes": {
							"attachment": {
								"type": "template",
								"buttons": [{
									"value": "💸 TRUE",
									"type": "action",
									"target": "blank",
									"link": "",
									"action": "#d3e25519-d5c7-46f8-80d8-4e13e67bf83c",
									"show_echo": true
								}, {
									"value": "💁🏼 FALSE",
									"type": "action",
									"target": "blank",
									"link": "",
									"action": "#342e9579-6a49-46ff-a353-fdbab3d67e07",
									"show_echo": true
								}]
							}
						},
						"_tdJSONCondition": {
							"type": "expression",
							"conditions": [{
								"type": "condition",
								"operand1": "user_language",
								"operator": "notEqualAsStrings",
								"operand2": {
									"type": "const",
									"value": "it",
									"name": ""
								}
							}]
						}
					}
				}, {
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Ciao Jovana qui!",
						"_tdJSONCondition": {
							"type": "expression",
							"conditions": [{
								"type": "condition",
								"operand1": "user_language",
								"operator": "equalAsStrings",
								"operand2": {
									"type": "const",
									"value": "it",
									"name": ""
								}
							}]
						}
					}
				}, {
					"type": "wait",
					"time": 1600
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Ho un mini quiz per te!",
						"_tdJSONCondition": {
							"type": "expression",
							"conditions": [{
								"type": "condition",
								"operand1": "user_language",
								"operator": "equalAsStrings",
								"operand2": {
									"type": "const",
									"value": "it",
									"name": ""
								}
							}]
						}
					}
				}, {
					"type": "wait",
					"time": 1300
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "I chatbot proattivi sul tuo sito aiutano a aumentare notevolmente **il tuo tasso di conversione**",
						"attributes": {
							"attachment": {
								"type": "template",
								"buttons": [{
									"value": "💸 VERO",
									"type": "action",
									"target": "blank",
									"link": "",
									"action": "#d3e25519-d5c7-46f8-80d8-4e13e67bf83c",
									"show_echo": true
								}, {
									"value": "🤷 FALSO",
									"type": "action",
									"target": "blank",
									"link": "",
									"action": "#342e9579-6a49-46ff-a353-fdbab3d67e07",
									"show_echo": true
								}]
							}
						},
						"_tdJSONCondition": {
							"type": "expression",
							"conditions": [{
								"type": "condition",
								"operand1": "user_language",
								"operator": "equalAsStrings",
								"operand2": {
									"type": "const",
									"value": "it",
									"name": ""
								}
							}]
						}
					}
				}]
			},
			"_tdActionTitle": null,
			"_tdActionId": "UUIDV4"
		}],
		"intent_display_name": "jovana",
		"intent_id": "c41a9449-cb88-4101-9bad-add24d1e723e",
		"question": "\\start\nhi\nhello\nbuongiorno buonasera\nciao\ngood evening\ngood morning good afternoon\nHey need more info",
		"language": "en"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "reply",
			"text": "I didn't understand. Can you rephrase your question?\r\nOr pick accordingly below\r\nNon ho capito, ti spiace parafrasare?\r\nOppure scegli una delle opzioni\r\n",
			"attributes": {
				"commands": [{
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "I didn't understand. Can you rephrase your question?",
						"_tdJSONCondition": {
							"type": "expression",
							"conditions": [{
								"type": "condition",
								"operand1": "user_language",
								"operator": "matches",
								"operand2": {
									"type": "const",
									"value": "^en.*$",
									"name": ""
								}
							}, {
								"type": "operator",
								"operator": "OR"
							}, {
								"type": "condition",
								"operand1": "user_language",
								"operator": "matches",
								"operand2": {
									"type": "const",
									"value": "^(?!it.*).*$",
									"name": ""
								}
							}]
						}
					}
				}, {
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Or pick accordingly below",
						"_tdJSONCondition": {
							"type": "expression",
							"conditions": [{
								"type": "condition",
								"operand1": "user_language",
								"operator": "matches",
								"operand2": {
									"type": "const",
									"value": "^en.*$",
									"name": ""
								}
							}, {
								"type": "operator",
								"operator": "OR"
							}, {
								"type": "condition",
								"operand1": "user_language",
								"operator": "matches",
								"operand2": {
									"type": "const",
									"value": "^(?!it.*).*$",
									"name": ""
								}
							}]
						}
					}
				}, {
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Non ho capito, ti spiace parafrasare?",
						"_tdJSONCondition": {
							"type": "expression",
							"conditions": [{
								"type": "condition",
								"operand1": "user_language",
								"operator": "matches",
								"operand2": {
									"type": "const",
									"value": "^it.*$",
									"name": ""
								}
							}]
						}
					}
				}, {
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Oppure scegli una delle opzioni",
						"_tdJSONCondition": {
							"type": "expression",
							"conditions": [{
								"type": "condition",
								"operand1": "user_language",
								"operator": "matches",
								"operand2": {
									"type": "const",
									"value": "^it.*$",
									"name": ""
								}
							}]
						}
					}
				}]
			},
			"_tdActionTitle": null,
			"_tdActionId": "UUIDV4"
		}],
		"intent_display_name": "fallback",
		"intent_id": "5e7838c5-ae73-496d-9ab3-6009a65ac165",
		"question": "defaultFallback",
		"language": "en"
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