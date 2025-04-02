const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "webrequestv2",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "returns a json body - GET - assign result - assign status - no condition",
			"url": "http://localhost:10002/test/webrequest/get/json",
			"headersString": {
				"Content-Type": "*/*",
				"Cache-Control": "no-cache",
				"User-Agent": "TiledeskBotRuntime"
			},
			"assignResultTo": "var1",
			"assignStatusTo": "status1",
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
						"text": "result assigned to: {{var1}} status assigned to: {{status1}}"
					}
				}]
			},
			"text": "..."
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "webrequestv2 - success status condition",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "GET",
			"url": "http://localhost:10002/test/webrequest/get/json",
			"headersString": {
				"Content-Type": "*/*",
				"Cache-Control": "no-cache",
				"User-Agent": "TiledeskBotRuntime"
			},
			"method": "GET",
			"trueIntent": "#SUCCESS",
			"falseIntent": "#FAILURE",
			"_tdActionType": "webrequestv2"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "webrequestv2 - failure status condition",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "GET",
			"url": "http://localhost:10002/test/webrequest/get/json2",
			"headersString": {
				"Content-Type": "*/*",
				"Cache-Control": "no-cache",
				"User-Agent": "TiledeskBotRuntime"
			},
			"method": "GET",
			"trueIntent": "#SUCCESS",
			"falseIntent": "#FAILURE",
			"_tdActionType": "webrequestv2"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "webrequestv2 - success block",
		"intent_id": "SUCCESS",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "",
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
						"text": "HTTP GET Success"
					}
				}]
			},
			"text": "HTTP GET Success"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "webrequestv2 - failure block",
		"intent_id": "FAILURE",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "",
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
						"text": "HTTP GET Failure"
					}
				}]
			},
			"text": "HTTP GET Failure"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "webrequestv2 - failure 300 status condition",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943090",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "GET",
			"url": "http://localhost:10002/test/webrequest/get/json",
			"headersString": {
				"Content-Type": "*/*",
				"Cache-Control": "no-cache",
				"User-Agent": "TiledeskBotRuntime"
			},
			"assignErrorTo": "error",
			"assignStatusTo": "status",
			"method": "GET",
			"trueIntent": "#SUCCESS300",
			"falseIntent": "#FAILURE300",
			"_tdActionType": "webrequestv2"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "webrequestv2 - failure block",
		"intent_id": "FAILURE300",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "",
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
						"text": "HTTP GET Failure with status {{status}} error {{error}}"
					}
				}]
			},
			"text": "HTTP GET Failure"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "webrequestv2 - post",
		"intent_id": "POST200",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "POST",
			"url": "http://localhost:10002/test/webrequest/post/json",
			"headersString": {
				"Content-Type": "application/json",
				"Cache-Control": "no-cache",
				"User-Agent": "TiledeskBotRuntime"
			},
			"jsonBody": "{\"name\":\"myname\",\"email\":\"myemail\"}",
			"bodyType": "json",
			"assignErrorTo": "error",
			"assignResultTo": "result",
			"assignStatusTo": "status",
			"method": "POST",
			"_tdActionType": "webrequestv2"
		}, {
			"_tdActionTitle": "",
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
						"text": "HTTP POST Success with status {{status}}. From reply, name: {{result.replyname}}, email: {{result.replyemail}}"
					}
				}]
			},
			"text": "HTTP GET Failure"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "webrequestv2 - post form-data",
		"intent_id": "POST-FORM-DATA",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "POST",
			"url": "http://localhost:10002/test/webrequest/post/form-data",
			"headersString": {
				"Content-Type": "multipart/form-data",
				// "Content-Type": "application/json",
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
					//"value": "https://tiledesk-html-site-tiledesk.replit.app/Curriculum_Andrea_Sponziello_english.txt",
					"value": "http://localhost:10002/test/webrequest/post/form-data/simple_file.txt",
					"enabled": true
				}
			],
			"bodyType": "form-data",
			"assignErrorTo": "error",
			"assignResultTo": "result",
			"assignStatusTo": "status",
			"method": "POST",
			"_tdActionType": "webrequestv2"
		}, {
			"_tdActionTitle": "",
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
						"text": "HTTP form-data Success. purpose: {{result.purpose}} file_contents: {{result.file_contents}}"
					}
				}]
			},
			"text": "HTTP form-data Success"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "webrequestv2 - post incorrect body",
		"intent_id": "POST200",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "POST",
			"url": "http://localhost:10002/test/webrequest/post/json",
			"headersString": {
				"Content-Type": "application/json",
				"Cache-Control": "no-cache",
				"User-Agent": "TiledeskBotRuntime"
			},
			"jsonBody": "{\"name\";\"myname\",\"email\":\"myemail\"}",
			"bodyType": "json",
			"assignErrorTo": "error",
			"assignResultTo": "result",
			"assignStatusTo": "status",
			"falseIntent":"#FAILURE",
			"method": "POST",
			"_tdActionType": "webrequestv2"
		}, {
			"_tdActionTitle": "",
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
						"text": "HTTP POST Success with status {{status}}. From reply, name: {{result.replyname}}, email: {{result.replyemail}}"
					}
				}]
			},
			"text": "HTTP GET Failure"
		}]
	}, {
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
						"text": "webrequest replied: {{flowError}}"
					}
				}]
			}
		}],
		"language": "en",
		"intent_display_name": "gpt intent false",
		"intent_id": "FAILURE"
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