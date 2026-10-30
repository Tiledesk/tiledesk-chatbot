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
			"intent_display_name": "extract_success",
			"intent_id": "extract-success",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "docparse_extract",
				"_tdActionTitle": "extract ready",
				"filename": "8.pdf",
				"url": "https://example.com/8.pdf",
				"assignReplyTo": "extracted_text",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "extract_redis",
			"intent_id": "extract-redis",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "docparse_extract",
				"_tdActionTitle": "extract waiting for redis",
				"filename": "scan.pdf",
				"url": "https://example.com/scan.pdf",
				"mode": "full",
				"assignReplyTo": "extracted_text",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "extract_attributes",
			"intent_id": "extract-attributes",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "docparse_extract",
				"_tdActionTitle": "extract from attributes",
				"filename": "{{doc_name}}",
				"url": "{{doc_url}}",
				"assignReplyTo": "extracted_text",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "extract_filename_from_url",
			"intent_id": "extract-filename-from-url",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "docparse_extract",
				"_tdActionTitle": "extract filename from url",
				"url": "https://example.com/documents/my%20invoice.pdf?token=signed#download",
				"assignReplyTo": "extracted_text",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "extract_fallback",
			"intent_id": "extract-fallback",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "docparse_extract",
				"_tdActionTitle": "extract with vision fallback",
				"filename": "8.pdf",
				"url": "https://example.com/8.pdf",
				"provider": "openai",
				"model": "gpt-4o",
				"max_tokens": 8196,
				"confidence": 98,
				"language": "ita+eng",
				"dpi": 300,
				"assignReplyTo": "extracted_text",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "extract_confidence",
			"intent_id": "extract-confidence",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "docparse_extract",
				"_tdActionTitle": "extract with confidence",
				"filename": "8.pdf",
				"url": "https://example.com/8.pdf",
				"confidence": 92,
				"assignReplyTo": "extracted_text",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "extract_confidence_invalid",
			"intent_id": "extract-confidence-invalid",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "docparse_extract",
				"_tdActionTitle": "extract with invalid confidence",
				"filename": "8.pdf",
				"url": "https://example.com/8.pdf",
				"confidence": 150,
				"assignReplyTo": "extracted_text",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "extract_fail_job",
			"intent_id": "extract-fail-job",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "docparse_extract",
				"_tdActionTitle": "extract job error",
				"filename": "broken.pdf",
				"url": "https://example.com/broken.pdf",
				"assignReplyTo": "extracted_text",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "extract_fail_http",
			"intent_id": "extract-fail-http",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "docparse_extract",
				"_tdActionTitle": "extract http error",
				"filename": "8.pdf",
				"url": "https://example.com/8.pdf",
				"assignReplyTo": "extracted_text",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "extract_fail_missing",
			"intent_id": "extract-fail-missing",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "docparse_extract",
				"_tdActionTitle": "extract missing url",
				"filename": "8.pdf",
				"assignReplyTo": "extracted_text",
				"trueIntent": "#SUCCESS",
				"falseIntent": "#FAILURE"
			}]
		},
		{
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
							"text": "extracted: {{extracted_text}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "extract intent true",
			"intent_id": "SUCCESS"
		},
		{
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
							"text": "extract failed: {{flowError}}"
						}
					}]
				}
			}],
			"language": "en",
			"intent_display_name": "extract intent false",
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

// A Design Studio V3 bot: the docparse blocks carry NO trueIntent/falseIntent, the exits live only
// in the bot's `connectors` list (ConnectorsV3 projects them onto the action before it runs).
const exitIntents = [intents_dict_by_intent_id["SUCCESS"], intents_dict_by_intent_id["FAILURE"]];
function v3Extract(name, intentId, url) {
	return {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": name,
		"intent_id": intentId,
		"form": {},
		"question": "",
		"actions": [{
			"_tdActionType": "docparse_extract",
			"_tdActionId": "dp",
			"_tdActionTitle": name,
			"url": url,
			"mode": "full",
			"assignReplyTo": "extracted_text",
			"trueIntent": "",
			"falseIntent": ""
		}]
	};
}
const connectorRecord = (from, slot, to) => ({
	"id": from + "/dp/" + slot + "/" + to,
	"from": { "intentId": from, "actionId": "dp", "slot": slot },
	"to": { "intentId": to },
	"kind": "action"
});
const v3intents = [
	v3Extract("extract_v3", "extract-v3", "https://example.com/v3.pdf"),
	v3Extract("extract_v3_fail", "extract-v3-fail", "https://example.com/v3-broken.pdf"),
	...JSON.parse(JSON.stringify(exitIntents))
];
const v3bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "docparse v3",
	"type": "tilebot",
	"ds_version": "v3",
	"connectors": {
		"version": 1,
		"updatedAt": "2026-10-26T00:00:00.000Z",
		"items": [
			connectorRecord("extract-v3", "true", "SUCCESS"),
			connectorRecord("extract-v3", "false", "FAILURE"),
			connectorRecord("extract-v3-fail", "true", "SUCCESS"),
			connectorRecord("extract-v3-fail", "false", "FAILURE")
		]
	},
	"intents": {},
	"intents_by_intent_id": {}
};
for (const intent of v3intents) {
	v3bot.intents[intent.intent_display_name] = intent;
	v3bot.intents_by_intent_id[intent.intent_id] = intent;
}
bots_data.bots["v3botID"] = v3bot;

module.exports = { bots_data: bots_data };
