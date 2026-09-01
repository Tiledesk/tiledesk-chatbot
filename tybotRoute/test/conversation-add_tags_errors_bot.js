// Fixture for conversation-add_tags_errors_test.js -- the DirAddTags failure and
// edge paths that conversation-add-tags_bot.js (happy paths) does not reach.
//
// Every intent ends with a reply so the test can prove the flow CONTINUED past
// the failure instead of stalling on a callback that was never invoked.
const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "add tags errors bot",
	"type": "tilebot",
	"intents": [
		{
			// tags is the empty string -> mandatory-attribute error
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "add-tags-empty",
					"_tdActionType": "add_tags",
					"target": "request",
					"tags": "",
					"pushToList": false
				},
				{
					"_tdActionId": "add-tags-empty-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "empty-tags-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "add_tags_empty",
			"intent_id": "add-tags-empty-intent"
		},
		{
			// the request-tag endpoint answers non-2xx
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "add-tags-req-error",
					"_tdActionType": "add_tags",
					"target": "request",
					"tags": " tagA , tagB ,",
					"pushToList": false
				},
				{
					"_tdActionId": "add-tags-req-error-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "request-tag-error-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "add_tags_request_error",
			"intent_id": "add-tags-req-error-intent"
		},
		{
			// pushToList with a project tag-list endpoint that answers non-2xx
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "add-tags-push-error",
					"_tdActionType": "add_tags",
					"target": "request",
					"tags": "tagC",
					"pushToList": true
				},
				{
					"_tdActionId": "add-tags-push-error-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "push-error-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "add_tags_push_error",
			"intent_id": "add-tags-push-error-intent"
		},
		{
			// target lead, but the request the lead hangs off does not exist (404)
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "add-tags-lead-404",
					"_tdActionType": "add_tags",
					"target": "lead",
					"tags": "tagD",
					"pushToList": false
				},
				{
					"_tdActionId": "add-tags-lead-404-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "lead-missing-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "add_tags_lead_missing_request",
			"intent_id": "add-tags-lead-404-intent"
		},
		{
			// target lead, request found, but the lead-tag endpoint answers non-2xx
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "add-tags-lead-error",
					"_tdActionType": "add_tags",
					"target": "lead",
					"tags": "tagF,tagG",
					"pushToList": false
				},
				{
					"_tdActionId": "add-tags-lead-error-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "lead-tag-error-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "add_tags_lead_error",
			"intent_id": "add-tags-lead-error-intent"
		},
		{
			// target the directive does not know: neither branch runs, but the
			// flow must still go on.
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "add-tags-unknown-target",
					"_tdActionType": "add_tags",
					"target": "something_else",
					"tags": "tagE",
					"pushToList": false
				},
				{
					"_tdActionId": "add-tags-unknown-target-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "unknown-target-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "add_tags_unknown_target",
			"intent_id": "add-tags-unknown-target-intent"
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
