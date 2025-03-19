const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "coding",
	"type": "tilebot",
	"attributes": {
		"variables": {
			"json_data": "json_data"
		}
	},
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "",
			"_tdActionId": "fe9bff7c-9712-4769-b123-80e7767cb134",
			"_tdActionType": "setattribute-v2",
			"operation": {
				"operands": [{
					"value": "string_value",
					"isVariable": false
				}],
				"operators": []
			},
			"destination": "myvar"
		}, {
			"_tdActionTitle": "",
			"_tdActionId": "bbc02bfc-ddfb-40c8-af56-680634e45283",
			"_tdActionType": "reply",
			"attributes": {
				"disableInputMessage": false,
				"commands": [{
					"type": "wait"
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "value: ${myvar}"
					}
				}]
			},
			"text": "..."
		}],
		"language": "en",
		"intent_display_name": "basic assignment",
		"intent_id": "intent1"
	},{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "",
			"_tdActionId": "fe9bff7c-9712-4769-b123-80e7767cb134",
			"_tdActionType": "setattribute-v2",
			"operation": {
				"operands": [{
					"value": "{\"name\":\"tiledesk\"}",
					"isVariable": false,
					"type": "json"
				}],
				"operators": []
			},
			"destination": "myvar"
		}, {
			"_tdActionTitle": "",
			"_tdActionId": "bbc02bfc-ddfb-40c8-af56-680634e45283",
			"_tdActionType": "reply",
			"attributes": {
				"disableInputMessage": false,
				"commands": [{
					"type": "wait"
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "value: {{myvar | json}}"
					}
				}]
			},
			"text": "..."
		}],
		"language": "en",
		"intent_display_name": "json assignment",
		"intent_id": "intent2"
	},{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "",
			"_tdActionId": "fe9bff7c-9712-4769-b123-80e7767cb134",
			"_tdActionType": "setattribute-v2",
			"operation": {
				"operands": [
					{
						"value": "12",
						"isVariable": false,
						"function": "convertToNumber"
					}
				],
				"operators": []
			},
			"destination": "age"
		}, {
			"_tdActionTitle": "",
			"_tdActionId": "bbc02bfc-ddfb-40c8-af56-680634e45283",
			"_tdActionType": "reply",
			"attributes": {
				"disableInputMessage": false,
				"commands": [{
					"type": "wait"
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "my age: {{age}}"
					}
				}]
			},
			"text": "..."
		}],
		"language": "en",
		"intent_display_name": "convert to number",
		"intent_id": "intent3"
	},{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "",
			"_tdActionId": "fe9bff7c-9712-4769-b123-80e7767cb134",
			"_tdActionType": "setattribute-v2",
			"operation": {
				"operands": [
					{
						"value": "{\"name\":\"tiledesk\"}",
						"isVariable": false,
						"function": "JSONparse"
					}
				],
				"operators": []
			},
			"destination": "person"
		}, {
			"_tdActionTitle": "",
			"_tdActionId": "bbc02bfc-ddfb-40c8-af56-680634e45283",
			"_tdActionType": "reply",
			"attributes": {
				"disableInputMessage": false,
				"commands": [{
					"type": "wait"
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "person is: {{person | json}}"
					}
				}]
			},
			"text": "..."
		}],
		"language": "en",
		"intent_display_name": "convert to json",
		"intent_id": "intent3"
	}
]
}

// normalize the bot structure for the static intent search
let intents = bot.intents;
delete bot.intents;
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