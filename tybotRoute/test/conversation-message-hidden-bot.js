const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Hidden message",
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
		"intent_id": "c4ca466b-8ee7-4df3-83f7-33e4dd51e767",
		"intent_display_name": "defaultFallback",
		"language": "en",
		"attributes": {
		  "position": {
			"x": 714,
			"y": 528
		  }
		}
	  },
	  {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [
		  {
			"_tdActionTitle": "",
			"_tdActionId": "4024e113-f160-4598-a105-c80840f4fe7d",
			"_tdActionType": "hmessage",
			"attributes": {
			  "subtype": "info"
			},
			"text": "this is an hidden message"
		  }
		],
		"intent_id": "cec0304f-5bd4-4741-87b4-6693b87797a0",
		"intent_display_name": "send_hidden_message",
		"language": "en",
		"attributes": {
		  "position": {
			"x": 688,
			"y": 129
		  },
		  "nextBlockAction": {
			"_tdActionTitle": "",
			"_tdActionId": "8fb40df2-fd33-46ef-a9fb-50e034e7e410",
			"_tdActionType": "intent",
			"intentName": null
		  }
		}
	  },
	  {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [
		  {
			"_tdActionType": "intent",
			"intentName": "#cec0304f-5bd4-4741-87b4-6693b87797a0",
			"_tdActionId": "548559d74ceb418da1d8bc0bbf1d88c3"
		  }
		],
		"intent_id": "48673a18-d16f-4c2f-b9da-a4e1651ec7f8",
		"question": "\\start",
		"intent_display_name": "start",
		"language": "en",
		"attributes": {
		  "position": {
			"x": 172,
			"y": 384
		  },
		  "nextBlockAction": {
			"_tdActionTitle": "",
			"_tdActionId": "b7fdeb73-d5c8-49bc-8995-0fd46a39034d",
			"_tdActionType": "intent"
		  }
		}
	  },
	  {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [
		  {
			"_tdActionTitle": "",
			"_tdActionId": "97d03302-790d-4944-b488-5c64b4ab0d92",
			"_tdActionType": "hmessage",
			"attributes": {
			  "subtype": "info"
			},
			"text": "this is an hidden message not to sent"
		  },
		  {
			"_tdActionTitle": "",
			"_tdActionId": "e5c74e88-eb73-492a-ac07-8190e27fd2c8",
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
					"text": "hidden message not sent: ok",
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
		"intent_display_name": "no_draft",
		"intent_id": "5221dde8-c687-4a1b-8c50-870699f8e24c",
		"attributes": {
		  "position": {
			"x": 1111,
			"y": 199
		  },
		  "nextBlockAction": {
			"_tdActionId": "a596376f-6be7-4121-8aac-2533b1e04e48",
			"_tdActionType": "intent",
			"intentName": ""
		  }
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