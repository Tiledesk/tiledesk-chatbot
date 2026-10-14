const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "data_table_get_success",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "data_table",
				"_tdActionTitle": "data_table get",
				"tableId": "tableId",
				"operation": "get",
                "must_match": "all",
                "conditions": [
                    {
                        "column": "fullname",
                        "value": "John Doe",
                        "operator": "equals"
                    }
                ],
				"assignResultTo": "data_table_result",
				"assignErrorTo": "flowError",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
        {
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "data_table_insert_success",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "data_table",
				"_tdActionTitle": "data_table get",
				"tableId": "tableId",
				"operation": "insert",
                "data": {
                    "fullname": "John Doe",
                    "city": "New York"
                },
				"assignResultTo": "data_table_result",
				"assignErrorTo": "flowError",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
        {
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "data_table_update_success",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "data_table",
				"_tdActionTitle": "data_table get",
				"tableId": "tableId",
				"operation": "update",
                "must_match": "all",
                "conditions": [
                    {
                        "column": "fullname",
                        "value": "John Doe",
                        "operator": "equals"
                    }
                ],
                "data": {
                    "city": "Los Angeles"
                },
				"assignResultTo": "data_table_result",
				"assignErrorTo": "flowError",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
        {
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "data_table_upsert_success",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "data_table",
				"_tdActionTitle": "data_table get",
				"tableId": "tableId",
				"operation": "upsert",
                "must_match": "all",
                "conditions": [
                    {
                        "column": "fullname",
                        "value": "John Doe",
                        "operator": "equals"
                    }
                ],
                "data": {
                    "city": "Los Angeles"
                },
				"assignResultTo": "data_table_result",
				"assignErrorTo": "flowError",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
        {
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "data_table_delete_success",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "data_table",
				"_tdActionTitle": "data_table get",
				"tableId": "tableId",
				"operation": "delete",
                "must_match": "all",
                "conditions": [
                    {
                        "column": "fullname",
                        "value": "John Doe",
                        "operator": "equals"
                    },
                    {
                        "column": "city",
                        "value": "New York",
                        "operator": "equals"
                    }
                ],
				"assignResultTo": "data_table_result",
				"assignErrorTo": "flowError",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
		{
			// TRUE INTENT
			"webhook_enabled": false,
			"enabled": true,
			"actions": [{
				"_tdActionType": "reply",
				"text": "xxx",
				"attributes": {
					"commands": [{
						"type": "wait",
						"time": 500
					}, {
						"type": "message",
						"message": {
							"type": "text",
							"text": "chatbot replied: {{data_table_result}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "data_table intent true",
			"intent_id": "SUCCESS"
		},
		{
			// FALSE INTENT
			"webhook_enabled": false,
			"enabled": true,
			"actions": [{
				"_tdActionType": "reply",
				"text": "xxx",
				"attributes": {
					"commands": [{
						"type": "wait",
						"time": 500
					}, {
						"type": "message",
						"message": {
							"type": "text",
							"text": "chatbot replied with error: {{flowError}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "data_table intent false",
			"intent_id": "FAILURE"
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