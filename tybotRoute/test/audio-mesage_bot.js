
const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Echo bot",
	"type": "tilebot",
	"intents": [
	  {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [
		  {
			"_tdActionType": "reply",
			"text": "I didn't understand. Can you rephrase your question?",
			"attributes": {
			  "commands": [
				{
				  "type": "wait",
				  "time": 500
				},
				{
				  "type": "message",
				  "message": {
					"type": "text",
					"text": "I didn't understand. Can you rephrase your question?"
				  }
				}
			  ]
			}
		  }
		],
		"intent_id": "c3a18547-63e5-49d8-b7fc-d750bcc6d1f8",
		"intent_display_name": "defaultFallback",
		"language": "en",
		"attributes": {
		  "position": {
			"x": 714,
			"y": 528
		  }
		},
		"agents_available": false
	  },
	  {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [
		  {
			"_tdActionType": "intent",
			"intentName": "#aedb1499-c611-4d2a-ba47-bac791154a60",
			"_tdActionId": "08ce2417c4024e95b59b764908ea80ff"
		  }
		],
		"intent_id": "3bfda939-ff76-4762-bbe0-fc0f0dc4c76b",
		"question": "\\start",
		"intent_display_name": "start",
		"language": "en",
		"attributes": {
		  "position": {
			"x": 172,
			"y": 384
		  },
		  "readonly": true,
		  "nextBlockAction": {
			"_tdActionTitle": "",
			"_tdActionId": "05ceff42-91f6-4f7f-aa64-de73771b81ce",
			"_tdActionType": "intent"
		  }
		},
		"agents_available": false
	  },
	  {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [
		  {
			"_tdActionType": "reply",
			"attributes": {
			  "disableInputMessage": false,
			  "commands": [
				{
				  "type": "wait",
				  "time": 500
				},
				{
				  "type": "message",
				  "message": {
					"type": "text",
					"text": "send audio file to translate in text",
					"attributes": {
					  "attachment": {
						"type": "template",
						"buttons": []
					  }
					}
				  }
				}
			  ]
			},
			"text": "Hi, how can I help you?\r\n",
			"_tdActionId": "f1696537322f4c0eb52a7dee20b95f6c"
		  },
		  {
			"_tdActionTitle": "",
			"_tdActionId": "eb096727-052f-4ff6-a497-ee08c90f5087",
			"_tdActionType": "capture_user_reply"
		  }
		],
		"intent_id": "aedb1499-c611-4d2a-ba47-bac791154a60",
		"intent_display_name": "welcome",
		"language": "en",
		"attributes": {
		  "position": {
			"x": 719,
			"y": -13
		  },
		  "nextBlockAction": {
			"_tdActionTitle": "",
			"_tdActionId": "116dbbdf-0c22-4a8b-baa2-e7ce01513ad8",
			"_tdActionType": "intent",
			"intentName": "#f737743d-1077-4cc4-a030-75d7df2a8e01"
		  }
		},
		"agents_available": false
	  },
	  {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [
		  {
			"_tdActionTitle": "",
			"_tdActionId": "f3652ae3-a58b-4c90-87c5-3584f3f38763",
			"_tdActionType": "reply",
			"attributes": {
			  "disableInputMessage": false,
			  "commands": [
				{
				  "type": "wait",
				  "time": 500
				},
				{
				  "type": "message",
				  "message": {
					"type": "text",
					"text": "{{lastUserText}}",
					"attributes": {
					  "attachment": {
						"type": "template",
						"buttons": []
					  }
					}
				  }
				}
			  ]
			}
		  }
		],
		"language": "en",
		"intent_display_name": "audio text",
		"intent_id": "f737743d-1077-4cc4-a030-75d7df2a8e01",
		"agents_available": false,
		"attributes": {
		  "position": {
			"x": 1128.7436075011951,
			"y": -62.71317432251169
		  },
		  "nextBlockAction": {
			"_tdActionId": "f755626e-70c4-4aac-93f9-786b98332218",
			"_tdActionType": "intent",
			"intentName": ""
		  },
		  "connectors": {},
		  "color": "80,100,147",
		  "readonly": false
		}
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