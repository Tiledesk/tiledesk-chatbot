const PARENT_BOT_ID = "replaceParentBotID";
const CHILD_BOT_ID = "replaceChildBotID";
const GRANDCHILD_BOT_ID = "replaceGrandchildBotID";

const AFTER_RETURN_INTENT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CHILD_AFTER_INTENT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const PARENT_AFTER_NESTED_INTENT_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

function normalizeBot(bot) {
	const intents = bot.intents;
	delete bot.intents;
	const intents_dict_by_display_name = {};
	for (let i = 0; i < intents.length; i++) {
		intents_dict_by_display_name[intents[i].intent_display_name] = intents[i];
	}
	const intents_dict_by_intent_id = {};
	for (let i = 0; i < intents.length; i++) {
		intents_dict_by_intent_id[intents[i].intent_id] = intents[i];
	}
	bot.intents = intents_dict_by_display_name;
	bot.intents_by_intent_id = intents_dict_by_intent_id;
	return bot;
}

function replyAction(text) {
	return {
		"_tdActionType": "reply",
		"text": "...",
		"attributes": {
			"commands": [{
				"type": "wait",
				"time": 100
			}, {
				"type": "message",
				"message": {
					"type": "text",
					"text": text
				}
			}]
		}
	};
}

const parentBot = normalizeBot({
	"webhook_enabled": false,
	"language": "en",
	"name": "Replace parent bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "invoke_replace",
		"intent_id": "40000000-0000-0000-0000-000000000001",
		"question": "",
		"form": {},
		"actions": [{
			"_tdActionTitle": "Replace child",
			"_tdActionType": "replacebotv3",
			"botId": CHILD_BOT_ID,
			"useSlug": false,
			"blockName": "start"
		}],
		"attributes": {
			"nextBlockAction": {
				"_tdActionId": "49150f1f-ddb9-497f-86e7-ec5c29a60f13",
				"_tdActionType": "intent",
				"intentName": "#" + AFTER_RETURN_INTENT_ID
			}
		}
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "after_return",
		"intent_id": AFTER_RETURN_INTENT_ID,
		"question": "",
		"form": {},
		"actions": [replyAction("Returned to the parent")]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "invoke_nested",
		"intent_id": "40000000-0000-0000-0000-000000000002",
		"question": "",
		"form": {},
		"actions": [{
			"_tdActionTitle": "Replace nested",
			"_tdActionType": "replacebotv3",
			"botId": CHILD_BOT_ID,
			"useSlug": false,
			"blockName": "invoke_nested"
		}],
		"attributes": {
			"nextBlockAction": {
				"_tdActionId": "59150f1f-ddb9-497f-86e7-ec5c29a60f13",
				"_tdActionType": "intent",
				"intentName": "#" + PARENT_AFTER_NESTED_INTENT_ID
			}
		}
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "parent_after_nested",
		"intent_id": PARENT_AFTER_NESTED_INTENT_ID,
		"question": "",
		"form": {},
		"actions": [replyAction("Parent resumed")]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "replace_fail",
		"intent_id": "40000000-0000-0000-0000-000000000003",
		"question": "",
		"form": {},
		"actions": [{
			"_tdActionType": "replacebotv3",
			"botId": CHILD_BOT_ID,
			"useSlug": false,
			"blockName": "start"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "do_return",
		"intent_id": "40000000-0000-0000-0000-000000000004",
		"question": "",
		"form": {},
		"actions": [{
			"_tdActionType": "returnstack"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "defaultFallback",
		"intent_id": "40000000-0000-0000-0000-0000000000df",
		"question": "",
		"form": {},
		"actions": [replyAction("FALLBACK")]
	}]
});

const childBot = normalizeBot({
	"webhook_enabled": false,
	"language": "en",
	"name": "Replace child bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "start",
		"intent_id": "50000000-0000-0000-0000-000000000001",
		"question": "\\start",
		"form": {},
		"actions": [
			replyAction("Child working"),
			{
				"_tdActionType": "returnstack",
				"_tdActionId": "return-child"
			}
		]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "invoke_nested",
		"intent_id": "50000000-0000-0000-0000-000000000002",
		"question": "",
		"form": {},
		"actions": [{
			"_tdActionType": "replacebotv3",
			"botId": GRANDCHILD_BOT_ID,
			"useSlug": false,
			"blockName": "run"
		}],
		"attributes": {
			"nextBlockAction": {
				"_tdActionId": "69150f1f-ddb9-497f-86e7-ec5c29a60f13",
				"_tdActionType": "intent",
				"intentName": "#" + CHILD_AFTER_INTENT_ID
			}
		}
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "child_after",
		"intent_id": CHILD_AFTER_INTENT_ID,
		"question": "",
		"form": {},
		"actions": [
			replyAction("Child resumed"),
			{
				"_tdActionType": "returnstack",
				"_tdActionId": "return-child-after-nested"
			}
		]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "defaultFallback",
		"intent_id": "50000000-0000-0000-0000-0000000000df",
		"question": "",
		"form": {},
		"actions": [replyAction("FALLBACK")]
	}]
});

const grandchildBot = normalizeBot({
	"webhook_enabled": false,
	"language": "en",
	"name": "Replace grandchild bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "run",
		"intent_id": "60000000-0000-0000-0000-000000000001",
		"question": "\\run",
		"form": {},
		"actions": [
			replyAction("Grandchild working"),
			{
				"_tdActionType": "returnstack",
				"_tdActionId": "return-grandchild"
			}
		]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "defaultFallback",
		"intent_id": "60000000-0000-0000-0000-0000000000df",
		"question": "",
		"form": {},
		"actions": [replyAction("FALLBACK")]
	}]
});

const bots_data = {
	"bots": {}
};
bots_data.bots[PARENT_BOT_ID] = parentBot;
bots_data.bots[CHILD_BOT_ID] = childBot;
bots_data.bots[GRANDCHILD_BOT_ID] = grandchildBot;

module.exports = {
	bots_data,
	PARENT_BOT_ID,
	CHILD_BOT_ID,
	GRANDCHILD_BOT_ID
};
