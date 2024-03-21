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
					"_tdActionType": "dtmf_form",
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
									"text": "This is a dtmf form",
									"attributes": {
										"attachment": {
											"type": "template",
											"buttons": []
										}
									}
								}
							},
							{
								"type": "wait",
								"time": 0
							},
							{
								"type": "settings",
								"subType": "dtmf_form",
								"settings": {
									"maxDigits": "10",
									"terminators": "#"
								}
							}
						]
					}
				}
			],
			"intent_id": "2a08f448-ab0c-4149-8776-fe7d145a8733",
			"intent_display_name": "dtmfform",
			"language": "en"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "8fb872b7-e71a-4b1d-8537-36febe72cd24",
					"_tdActionType": "dtmf_menu",
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
									"text": "This is a dtmf menu",
									"attributes": {
										"attachment": {
											"type": "template",
											"buttons": []
										}
									}
								}
							},
							{
								"type": "wait",
								"time": 0
							},
							{
								"type": "settings",
								"subType": "dtmf_menu",
								"settings": {
									"no_input": "#no_input_id",
                                    "no_match": "#no_match_id",
                                    "timeout": 15,
                                    "bargein": true
								}
							}
						]
					}
				}
			],
			"intent_id": "2a08f448-ab0c-4149-8776-fe7d145a8733",
			"intent_display_name": "dtmfmenu",
			"language": "en"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "9e289c27-27b6-4de9-8d81-2e23cb159a30",
					"_tdActionType": "blind_transfer",
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
									"text": "This is a transfer",
									"attributes": {
										"attachment": {
											"type": "template",
											"buttons": []
										}
									}
								}
							},
							{
								"type": "wait",
								"time": 0
							},
							{
								"type": "settings",
								"settings": {
									"transferTo": "user@email.it"
								}
							}
						]
					}
				}
			],
			"intent_id": "2a08f448-ab0c-4149-8776-fe7d145a8785",
			"intent_display_name": "transfer",
			"language": "en",
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