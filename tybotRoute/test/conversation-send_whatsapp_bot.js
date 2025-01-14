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
			"intent_display_name": "send_whatsapp",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "send_whatsapp",
				"_tdActionTitle": "send whatsapp",
				"templateName": "hello_world",
				// OPTION 1
				"payload": {
					"id_project": "1234",
					"phone_number_id": "123456",
					"template": {
						"name": "hello_world",
						"language": "en"
					},
					"receiver_list": [
						{
							"phone_number": "{{phone_number}}",
							"body_params": [{
								"type": "text",
								"text": "{{firstname}}"
							}]
						}
					]
				},
				// OPTION 2
				//"payload": '{"id_project": "1234","phone_number_id": "123456","template": {"name": "hello_world","language": "en"},"receiver_list": [{"phone_number": "+393484506627","body_params": [{"type": "text","text": "Giovanni"}]}]}',
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "send_whatsapp_advanced",
			"intent_id": "00f93b97-89ee-466d-a09c-e47a18943057",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "send_whatsapp",
				"_tdActionTitle": "send whatsapp",
				"templateName": "hello_world",
				// OPTION 1
				"payload": {
					"id_project": "1234",
					"phone_number_id": "123456",
					"template": {
						"name": "hello_world",
						"language": "en"
					},
					"receiver_list": [
						{
							"phone_number": "{{phone_number}}",
							"header_params": [
								{
									"type": "IMAGE", // fisso
									"image": {
										"link": "{{image_url}}"
									}
								}
							],
							"body_params": [
								{
									"type": "text",
									"text": "{{firstname}}"
								},
								{
									"type": "text",
									"text": "{{car_model}}"
								}
							],
							"buttons_params": [
								{
									"type": "text",
									"text": "{{token}}"
								}
							]

						}
					]
				},
				// OPTION 2
				//"payload": '{"id_project": "1234","phone_number_id": "123456","template": {"name": "hello_world","language": "en"},"receiver_list": [{"phone_number": "+393484506627","body_params": [{"type": "text","text": "Giovanni"}]}]}',
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE",
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
							"text": "Whatsapp message sent successfully"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "send whatsapp intent true",
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
							"text": "Error sending whatsapp message"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "send whatsapp intent false",
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