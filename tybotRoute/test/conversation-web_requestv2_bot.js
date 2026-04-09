const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [
		// NO CONDITION
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "webrequestv2-nocondition",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "returns a json body - GET - assign result - assign status - no condition",
				"url": "http://127.0.0.1:10002/test/webrequest/get/json",
				"headersString": {
					"Content-Type": "*/*",
					"Cache-Control": "no-cache",
					"User-Agent": "TiledeskBotRuntime"
				},
				"assignResultTo": "reply",
				"assignStatusTo": "status",
				"method": "GET",
				"_tdActionType": "webrequestv2"
			}, {
				"_tdActionTitle": "reply check action",
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
							"text": "result assigned to: {{reply}} status assigned to: {{status}}"
						}
					}]
				},
				"text": "..."
			}]
		},
		// WITH CONDITION
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "webrequestv2-success_condition",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "GET",
				"url": "http://127.0.0.1:10002/test/webrequest/get/json",
				"headersString": {
					"Content-Type": "*/*",
					"Cache-Control": "no-cache",
					"User-Agent": "TiledeskBotRuntime"
				},
				"method": "GET",
				"assignResultTo": "reply",
				"assignStatusTo": "status",
				"assignErrorTo": "error",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
				"_tdActionType": "webrequestv2",
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "webrequestv2-failure_404",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "GET",
				"url": "http://127.0.0.1:10002/test/webrequest/get/json2",
				"headersString": {
					"Content-Type": "*/*",
					"Cache-Control": "no-cache",
					"User-Agent": "TiledeskBotRuntime"
				},
				"method": "GET",
				"assignResultTo": "reply",
				"assignStatusTo": "status",
				"assignErrorTo": "error",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE_REQUEST",
				"_tdActionType": "webrequestv2"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "webrequestv2-failure_300",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943090",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "GET",
				"url": "http://127.0.0.1:10002/test/webrequest/get/json",
				"headersString": {
					"Content-Type": "*/*",
					"Cache-Control": "no-cache",
					"User-Agent": "TiledeskBotRuntime"
				},
				"method": "GET",
				"assignResultTo": "reply",
				"assignErrorTo": "error",
				"assignStatusTo": "status",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE_REQUEST",
				"_tdActionType": "webrequestv2"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "webrequestv2_post",
			"intent_id": "POST200",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "POST",
				"url": "http://127.0.0.1:10002/test/webrequest/post/json",
				"headersString": {
					"Content-Type": "application/json",
					"Cache-Control": "no-cache",
					"User-Agent": "TiledeskBotRuntime"
				},
				"jsonBody": "{\"name\":\"myname\",\"email\":\"myemail\"}",
				"bodyType": "json",
				"method": "POST",
				"assignErrorTo": "error",
				"assignResultTo": "result",
				"assignStatusTo": "status",
				"trueIntent": "#SUCCESS_POST",
				"falseIntent": "#FAILURE_REQUEST",
				"_tdActionType": "webrequestv2"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "webrequestv2_post_form-data",
			"intent_id": "POST-FORM-DATA",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "POST",
				"url": "http://127.0.0.1:10002/test/webrequest/post/form-data",
				"headersString": {
					"Content-Type": "multipart/form-data",
					"Cache-Control": "no-cache",
					"User-Agent": "TiledeskBotRuntime"
				},
				"formData":
					[
						{
							"name": "purpose",
							"type": "Text",
							"value": "assistants",
							"enabled": true
						},
						{
							"name": "file",
							"type": "URL",
							"value": "http://127.0.0.1:10002/test/webrequest/post/form-data/simple_file.txt",
							"enabled": true
						}
					],
				"method": "POST",
				"bodyType": "form-data",
				"assignErrorTo": "error",
				"assignResultTo": "result",
				"assignStatusTo": "status",
				"trueIntent": "#SUCCESS_FORM_DATA",
				"falseIntent": "#FAILURE_REQUEST",
				"_tdActionType": "webrequestv2"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "webrequestv2_post-incorrect-body",
			"intent_id": "POST200",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionTitle": "POST",
				"url": "http://127.0.0.1:10002/test/webrequest/post/json",
				"headersString": {
					"Content-Type": "application/json",
					"Cache-Control": "no-cache",
					"User-Agent": "TiledeskBotRuntime"
				},
				"jsonBody": "{\"name\":myname,\"email\":\"myemail\"}", // missing "" in myname
				"bodyType": "json",
				"method": "POST",
				"assignErrorTo": "error",
				"assignResultTo": "result",
				"assignStatusTo": "status",
				"falseIntent": "#FAILURE",
				"_tdActionType": "webrequestv2"
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
							"text": "webrequest replied: {{reply}} with status {{status}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "gpt intent true",
			"intent_id": "SUCCESS"
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
							"text": "HTTP POST Success with status {{status}}. From reply, name: {{result.replyname}}, email: {{result.replyemail}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "gpt intent true",
			"intent_id": "SUCCESS_POST"
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
							"text": "HTTP form-data Success. purpose: {{result.purpose}} file_contents: {{result.file_contents}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "gpt intent true",
			"intent_id": "SUCCESS_FORM_DATA"
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
							"text": "webrequest error: {{flowError}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "gpt intent false",
			"intent_id": "FAILURE"
		},
		{
			// FALSE INTENT FAILURE_REQUEST
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
							"text": "webrequest failed with status {{status}} and error {{error}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "gpt intent false",
			"intent_id": "FAILURE_REQUEST"
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