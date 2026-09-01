// Fixture for routes_http_test.js.
//
// Three shapes are needed to drive the route layer:
//   start        - an intent with structured actions, so POST /ext/:botid takes
//                  the "reply.actions" branch;
//   BLOCK-1      - the same, addressed by intent_id, which is how
//                  POST /block/... ("/#<block_id>") and POST /exec/:botid reach it;
//   plain_answer - an intent with NO actions, which is the only way to make
//                  POST /exec/:botid fall through to sendSupportMessageExt.
const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "routes http bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "reply",
			"text": "Hello from ext",
			"attributes": {
				"commands": [{
					"type": "message",
					"message": {
						"type": "text",
						"text": "Hello from ext"
					}
				}]
			}
		}],
		"question": "\\start",
		"intent_display_name": "start",
		"language": "en",
		"intent_id": "11111111-1111-1111-1111-111111111111"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionType": "reply",
			"text": "Block executed",
			"attributes": {
				"commands": [{
					"type": "message",
					"message": {
						"type": "text",
						"text": "Block executed"
					}
				}]
			}
		}],
		"intent_display_name": "webhook_block",
		"language": "en",
		"intent_id": "BLOCK-1"
	}, {
		// A malformed action list: the designer never emits one, but a corrupted
		// or hand-edited intent does, and it is the only way to make
		// actionsToDirectives() throw inside the routes' try/catch.
		"webhook_enabled": false,
		"enabled": true,
		"actions": [null],
		"intent_display_name": "broken_actions",
		"language": "en",
		"intent_id": "33333333-3333-3333-3333-333333333333"
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"answer": "A plain textual answer",
		"intent_display_name": "plain_answer",
		"language": "en",
		"intent_id": "22222222-2222-2222-2222-222222222222"
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
