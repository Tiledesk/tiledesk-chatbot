const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Qapla Query",
	"type": "tilebot",
	"attributes": {
		"variables": {
			"qapla_track_num": "qapla_track_num",
			"track_status": "track_status",
			"track_error": "track_error",
			"track_result": "track_result"
		}
	},
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "",
			"_tdActionId": "4c04c334-b87d-4931-9d0e-57a7378936bd",
			"url": "http://localhost:10002/test/webrequest/get/json",
			"headersString": {
				"Content-Type": "application/json",
				"Cache-Control": "no-cache",
				"User-Agent": "TiledeskBotRuntime",
				"Accept": "*/*"
			},
			"jsonBody": "{}",
			"assignTo": "",
			"assignments": {
				"track_status": "getShipment.shipments.[0].status.qaplaStatus.status",
				"track_error": "getShipment.error",
				"track_result": "getShipment.result"
			},
			"method": "GET",
			"_tdActionType": "webrequest"
		}, {
			"_tdActionTitle": "shipment error?",
			"_tdActionId": "83542f83-f67b-47d7-9736-f38ed6242ff2",
			"_tdActionType": "jsoncondition",
			"groups": [{
				"type": "expression",
				"conditions": [{
					"type": "condition",
					"operand1": "track_result",
					"operator": "equalAsStrings",
					"operand2": {
						"type": "const",
						"value": "KO",
						"name": ""
					}
				}]
			}],
			"stopOnConditionMet": true,
			"trueIntent": "#862507d0-f91a-4962-8cfd-05950a7a17ba",
			"falseIntent": "#a96aa945-689c-4985-b228-aa8809410ca2"
		}],
		"intent_display_name": "start",
		"intent_id": "270fcec7-3b8f-465b-bcce-830c936a8584",
		"question": "\\start",
		"language": "en"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "",
			"_tdActionId": "c0dd762f-2eb4-4adf-acb4-bf4f00845dcb",
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
						"text": "Il tuo stato non è valido: ${track_error}"
					}
				}]
			},
			"text": "Il tuo stato non è valido: ${track_error}\r\n"
		}],
		"language": "en",
		"intent_display_name": "invalid_status",
		"intent_id": "862507d0-f91a-4962-8cfd-05950a7a17ba"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "",
			"_tdActionId": "f72a1859-a396-415c-90c8-938bd2207cc2",
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
						"text": "Lo stato del tuo ordine è ${track_status}"
					}
				}]
			},
			"text": "Lo stato del tuo ordine è ${track_status}\r\n"
		}],
		"language": "en",
		"intent_display_name": "order_status",
		"intent_id": "a96aa945-689c-4985-b228-aa8809410ca2"
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