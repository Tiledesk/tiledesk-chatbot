const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "reply",
			"text": "I didn't understand. Can you rephrase your question?",
			"attributes": {
				"commands": [{
					"type": "message",
					"message": {
						"type": "text",
						"text": "I didn't understand. Can you rephrase your question?"
					}
				}]
			}
		}],
		"question": "defaultFallback",
		"intent_display_name": "defaultFallback",
		"language": "en",
		"intent_id": "94a862e0-fb65-46a8-b308-bed57394c806"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "reply",
			"text": "Hi, how can I help you?\r\n",
			"attributes": {
				"commands": [{
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Hi, how can I help you?",
						"attributes": {
							"attachment": {
								"type": "template",
								"buttons": [{
									"value": "/webrequest",
									"type": "text",
									"target": "blank",
									"link": "",
									"action": "",
									"show_echo": true
								}]
							}
						}
					}
				}]
			},
			"_tdActionTitle": null
		}],
		"question": "\\start",
		"intent_display_name": "start",
		"language": "en",
		"intent_id": "67bd1a23-dbfc-425e-be84-c9f7562699ee"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "var1",
			"url": "http://localhost:10002/test/webrequest/get/plain",
			"headersString": {
				"Content-Type": "application/json",
				"Cache-Control": "no-cache",
				"User-Agent": "TiledeskBotRuntime"
			},
			"jsonBody": "{}",
			"assignTo": "var1",
			"method": "GET",
			"_tdActionType": "webrequest"
		}, {
			"_tdActionTitle": "service_reply",
			"url": "http://localhost:10002/test/webrequest/post/plain",
			"headersString": {
				"Content-Type": "application/json",
				"Cache-Control": "no-cache",
				"User-Agent": "TiledeskBotRuntime",
				"Accept": "*/*"
			},
			"jsonBody": "{\n\t\"name\": \"Andrea\"\n}",
			"assignTo": "service_reply",
			"method": "POST",
			"_tdActionType": "webrequest"
		}, {
			"_tdActionTitle": "var1: ${var1}",
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
						"text": "var1: ${var1}"
					}
				}, {
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "service_reply: ${service_reply}"
					}
				}]
			},
			"text": "var1: ${var1}\r\nservice_reply: ${service_reply}\r\n"
		}],
		"language": "en",
		"intent_display_name": "webrequest",
		"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
		"form": {},
		"question": ""
	}, {
		"intent_display_name": "webrequest_with_assignments",
		"intent_id": "12345678-0000-0000-0000-000000000001",
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionTitle": "json call",
			"url": "http://localhost:10002/test/webrequest/get/json",
			"headersString": {
				"Content-Type": "application/json",
				"Cache-Control": "no-cache",
				"User-Agent": "TiledeskBotRuntime"
			},
			"jsonBody": "{}",
			"assignments": {
				"name": "name",
				"time": "time",
				"owner_name": "owner.name",
				"html": "html",
				"kid_0_name": "kids.[0].name",
				"kids_1_name": "kids.[1].name",
				"kids_3_name": "kids.[3].name",
				"last_kid": "last kids",
				"first_name": "first names",
				"last_name": "last names",
				"last_element_with_handlebars_syntax": "{{#each kids}}{{#if @last}}{{this.name}}{{/if}}{{/each}}"
			},
			"method": "GET",
			"_tdActionType": "webrequest"
		}, {
			"_tdActionTitle": "plain call",
			"url": "http://localhost:10002/test/webrequest/get/plain",
			"headersString": {
				"Content-Type": "application/json",
				"Cache-Control": "no-cache",
				"User-Agent": "TiledeskBotRuntime",
				"Accept": "*/*"
			},
			"jsonBody": "{}",
			"assignments": {
				"message": "body"
			},
			"method": "GET",
			"_tdActionType": "webrequest"
		}, {
			"_tdActionTitle": "message check",
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
						"text": "message check: ${name} ${time} ${owner_name} ${html} ${kid_0_name} ${kids_1_name} ${kids_3_name} ${last_kid} ${first_name} ${last_name} ${last_element_with_handlebars_syntax} ${message}"
					}
				}]
			},
			"text": "..."
		}]
		
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
  intent_dict["#" + intents[i].intent_id] = intents[i];
}
bot.intents = intent_dict;
const bots_data = {
  "bots": {}
}
bots_data.bots["botID"] = bot;

module.exports = { bots_data: bots_data };