// Bot for executions_lifecycle_test.js: start -> check (web request, false exit) -> after.

function setAttribute(id, destination, value) {
	return {
		"_tdActionType": "setattribute",
		"_tdActionId": id,
		"_tdActionTitle": "set " + destination,
		"operation": {
			"operands": [{
				"value": value,
				"isVariable": false
			}],
			"operators": []
		},
		"destination": destination
	};
}

const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Executions lifecycle bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "start",
		"intent_id": "start",
		"question": "",
		"actions": [
			setAttribute("act_total", "order_total", "42"),
			setAttribute("act_status", "status", "new"),
			{
				"_tdActionType": "intent",
				"_tdActionId": "act_goto_check",
				"_tdActionTitle": "go to check",
				"intentName": "#check"
			}
		]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "check",
		"intent_id": "check",
		"question": "",
		"actions": [{
			"_tdActionType": "webrequestv2",
			"_tdActionId": "act_fail_request",
			"_tdActionTitle": "GET fail",
			"url": "http://localhost:10003/fail",
			"headersString": {
				"Content-Type": "*/*",
				"Cache-Control": "no-cache",
				"User-Agent": "TiledeskBotRuntime"
			},
			"method": "GET",
			"assignStatusTo": "status_code",
			"falseIntent": "#after"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "after",
		"intent_id": "after",
		"question": "",
		"actions": [{
			"_tdActionType": "reply",
			"_tdActionId": "act_done",
			"_tdActionTitle": "done",
			"text": "done",
			"attributes": {
				"commands": [{
					"type": "message",
					"message": {
						"type": "text",
						"text": "done"
					}
				}]
			}
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "empty",
		"intent_id": "empty",
		"question": "",
		"actions": []
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "count",
		"intent_id": "count",
		"question": "",
		"actions": [
			setAttribute("act_c1", "c1", "1"),
			setAttribute("act_c2", "c2", "2"),
			setAttribute("act_c3", "c3", "3")
		]
	}]
}

// normalize the bot structure for the static intent search
let intents = bot.intents;
delete bot.intents;
let intents_dict_by_display_name = {};
let intents_dict_by_intent_id = {};
for (let i = 0; i < intents.length; i++) {
	intents_dict_by_display_name[intents[i].intent_display_name] = intents[i];
	intents_dict_by_intent_id[intents[i].intent_id] = intents[i];
}
bot.intents = intents_dict_by_display_name;
bot.intents_by_intent_id = intents_dict_by_intent_id;
const bots_data = {
	"bots": {}
}
bots_data.bots["botID"] = bot;

module.exports = { bots_data: bots_data };
