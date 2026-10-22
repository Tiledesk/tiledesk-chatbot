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

module.exports = { bots_data: bots_data };
