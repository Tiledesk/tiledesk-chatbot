// Voice bot with an Ask Knowledge Base action: "kb" asks the KB into {{kb_reply}}; both branches speak {{kb_reply}}
// with a speech_form (as the voice bots do), so a streamed answer is closed by the reply instead of being re-spoken.
const speak = (id, name) => ({
	"webhook_enabled": false,
	"enabled": true,
	"language": "it",
	"intent_display_name": name,
	"intent_id": id,
	"form": {},
	"question": "",
	"actions": [{
		"_tdActionType": "speech_form",
		"_tdActionId": "speech-form-" + name,
		"attributes": {
			"disableInputMessage": false,
			"commands": [
				{ "type": "wait", "time": 0 },
				{ "type": "message", "message": { "type": "text", "text": "{{kb_reply}}" } },
				{ "type": "wait", "time": 0 },
				{ "type": "settings", "subType": "speech_form", "settings": { "bargein": true, "noInputTimeout": 10000 } }
			]
		}
	}]
});

const bot = {
	"webhook_enabled": false,
	"language": "it",
	"name": "Voice KB bot",
	"type": "tilebot",
	"intents": [
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "it",
			"intent_display_name": "kb",
			"intent_id": "5b2d7c1e-6a3f-4e8b-9c11-7d4e2f8a9b01",
			"form": {},
			"question": "",
			"actions": [{
				"_tdActionType": "askgptv2",
				"_tdActionId": "askkb-kb",
				"assignReplyTo": "kb_reply",
				"assignSourceTo": "kb_source",
				"model": "gpt-4o",
				"citations": true,
				"question": "{{lastUserText}}",
				"trueIntent": "#KBO",
				"falseIntent": "#NOANS"
			}]
		},
		speak("KBO", "kbo"),
		speak("NOANS", "noans")
	]
}

// the engine looks intents up by display name and by id
const byName = {};
const byId = {};
bot.intents.forEach((i) => { byName[i.intent_display_name] = i; byId[i.intent_id] = i; });
bot.intents = byName;
bot.intents_by_intent_id = byId;

module.exports = { bots_data: { "bots": { "botID": bot } } };
