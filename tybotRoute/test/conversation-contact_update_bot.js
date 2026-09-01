// Fixture for conversation-contact_update_test.js -- DirContactUpdate ("leadupdate").
//
// Every intent pairs the leadupdate action with a following reply so the test can
// observe TWO things: the PUT the directive sends to /{projectId}/leads/{leadId},
// and the fact that the flow CONTINUED (the reply arrives). A directive that never
// invokes its callback would stall the flow and the reply would never be sent.
const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "lead update bot",
	"type": "tilebot",
	"intents": [
		{
			// leadupdate with literal values + one {{variable}} filled from the
			// lead attributes seeded by the incoming message.
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "lead-update-1",
					"_tdActionType": "leadupdate",
					"update": {
						"fullname": "Mario Rossi",
						"email": "{{userEmail}}",
						"company": "ACME",
						"phone": "+390000000"
					}
				},
				{
					"_tdActionTitle": "",
					"_tdActionId": "lead-update-1-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{
							"type": "wait",
							"time": 0
						}, {
							"type": "message",
							"message": {
								"type": "text",
								"text": "updated:${userFullname}:${userCompany}:${userPhone}"
							}
						}]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "lead_update",
			"intent_id": "lead-update-intent-1"
		},
		{
			// leadupdate carrying ONLY keys that are not in the
			// keyToChatbotConstMap: nothing must be written to the flow
			// attributes, but the properties must still reach the API.
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "lead-update-2",
					"_tdActionType": "leadupdate",
					"update": {
						"custom_field": "custom-value",
						"another_one": "{{unknown_variable}}"
					}
				},
				{
					"_tdActionTitle": "",
					"_tdActionId": "lead-update-2-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{
							"type": "wait",
							"time": 0
						}, {
							"type": "message",
							"message": {
								"type": "text",
								"text": "custom-only-done"
							}
						}]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "lead_update_custom_only",
			"intent_id": "lead-update-intent-2"
		},
		{
			// Used by the quarantined "API failure" test: the reply below is the
			// evidence that the flow survived a non-2xx answer from the leads API.
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "lead-update-3",
					"_tdActionType": "leadupdate",
					"update": {
						"fullname": "Never Stored"
					}
				},
				{
					"_tdActionTitle": "",
					"_tdActionId": "lead-update-3-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{
							"type": "wait",
							"time": 0
						}, {
							"type": "message",
							"message": {
								"type": "text",
								"text": "survived-the-error"
							}
						}]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "lead_update_api_error",
			"intent_id": "lead-update-intent-3"
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
