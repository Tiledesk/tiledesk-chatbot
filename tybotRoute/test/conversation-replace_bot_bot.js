// Fixture for conversation-replace_bot_test.js -- the directives/bot family:
// replacebot (v1), replacebotv2, replacebotv3 and removecurrentbot.
//
// `root_id` is set so the published-run branch of the analytics guard in
// DirReplaceBotV2/V3 is exercised. AnalyticsClient.track() is a no-op without
// ANALYTICS_INGEST_URL, which the test env does not set, so nothing leaves the
// process.
//
// Every intent ends with a reply: that reply is how each test proves the
// directive invoked its callback and the flow went on.
const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "replace bot",
	"type": "tilebot",
	"root_id": "ROOT-BOT-ID",
	"intents": [
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "v2-by-name",
					"_tdActionType": "replacebotv2",
					"botName": "{{target_bot}}"
				},
				{
					"_tdActionId": "v2-by-name-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "v2-name-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "replace_bot_v2_by_name",
			"intent_id": "v2-by-name-intent"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "v2-by-slug",
					"_tdActionType": "replacebotv2",
					"botName": "second-bot",
					"nameAsSlug": true
				},
				{
					"_tdActionId": "v2-by-slug-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "v2-slug-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "replace_bot_v2_by_slug",
			"intent_id": "v2-by-slug-intent"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "v2-with-block",
					"_tdActionType": "replacebotv2",
					"botName": "Second Bot",
					"blockName": "start_here"
				},
				{
					"_tdActionId": "v2-with-block-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "v2-block-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "replace_bot_v2_with_block",
			"intent_id": "v2-with-block-intent"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "v2-error",
					"_tdActionType": "replacebotv2",
					"botName": "Second Bot",
					"blockName": "never_sent"
				},
				{
					"_tdActionId": "v2-error-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "v2-error-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "replace_bot_v2_error",
			"intent_id": "v2-error-intent"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "v3-by-id",
					"_tdActionType": "replacebotv3",
					"botId": "BOT-ID-3",
					"botSlug": "ignored-slug"
				},
				{
					"_tdActionId": "v3-by-id-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "v3-id-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "replace_bot_v3_by_id",
			"intent_id": "v3-by-id-intent"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "v3-by-slug",
					"_tdActionType": "replacebotv3",
					"botId": "BOT-ID-3",
					"botSlug": "{{slug_var}}",
					"useSlug": true,
					"blockName": "{{block_var}}"
				},
				{
					"_tdActionId": "v3-by-slug-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "v3-slug-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "replace_bot_v3_by_slug",
			"intent_id": "v3-by-slug-intent"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "v3-error",
					"_tdActionType": "replacebotv3",
					"botId": "BOT-ID-3",
					"blockName": "never_sent"
				},
				{
					"_tdActionId": "v3-error-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "v3-error-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "replace_bot_v3_error",
			"intent_id": "v3-error-intent"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "v1-replace",
					"_tdActionType": "replacebot",
					"botName": "{{target_bot}}"
				},
				{
					"_tdActionId": "v1-replace-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "v1-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "replace_bot_v1",
			"intent_id": "v1-replace-intent"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "v1-not-found",
					"_tdActionType": "replacebot",
					"botName": "No Such Bot"
				},
				{
					"_tdActionId": "v1-not-found-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "v1-notfound-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "replace_bot_v1_not_found",
			"intent_id": "v1-not-found-intent"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "remove-current-bot",
					"_tdActionType": "removecurrentbot"
				},
				{
					"_tdActionId": "remove-current-bot-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "remove-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "remove_current_bot",
			"intent_id": "remove-current-bot-intent"
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
