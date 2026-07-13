const PARENT_BOT_ID = "parentBotID";
const SUBAGENT_BOT_ID = "subagentBotID";
const NESTED_SUBAGENT_BOT_ID = "nestedSubagentBotID";

const AFTER_RETURN_INTENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SUB1_AFTER_NESTED_INTENT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

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

const parentBot = normalizeBot({
	"webhook_enabled": false,
	"language": "en",
	"name": "Parent bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "invoke_subagent",
		"intent_id": "10000000-0000-0000-0000-000000000001",
		"question": "\\invoke_subagent",
		"form": {},
		"actions": [{
			"_tdActionTitle": "Invoke subagent",
			"_tdActionType": "replacebotv4",
			"botId": SUBAGENT_BOT_ID,
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
		"intent_display_name": "invoke_nested_chain",
		"intent_id": "10000000-0000-0000-0000-000000000002",
		"question": "\\invoke_nested_chain",
		"form": {},
		"actions": [{
			"_tdActionTitle": "Invoke nested subagent chain",
			"_tdActionType": "replacebotv4",
			"botId": SUBAGENT_BOT_ID,
			"useSlug": false,
			"blockName": "invoke_nested"
		}],
		"attributes": {
			"nextBlockAction": {
				"_tdActionId": "49150f1f-ddb9-497f-86e7-ec5c29a60f14",
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
		"actions": [{
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
						"text": "Subagent returned to the parent"
					}
				}]
			}
		}]
	}]
});

const subagentBot = normalizeBot({
	"webhook_enabled": false,
	"language": "en",
	"name": "Subagent bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "start",
		"intent_id": "20000000-0000-0000-0000-000000000001",
		"question": "\\start",
		"form": {},
		"actions": [{
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
						"text": "Subagent working"
					}
				}]
			}
		}, {
			"_tdActionType": "returnstack",
			"_tdActionId": "return-subagent"
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "invoke_nested",
		"intent_id": "20000000-0000-0000-0000-000000000002",
		"question": "\\invoke_nested",
		"form": {},
		"actions": [{
			"_tdActionTitle": "Invoke nested subagent",
			"_tdActionType": "replacebotv4",
			"botId": NESTED_SUBAGENT_BOT_ID,
			"useSlug": false,
			"blockName": "run"
		}],
		"attributes": {
			"nextBlockAction": {
				"_tdActionId": "nested-resume-block",
				"_tdActionType": "intent",
				"intentName": "#" + SUB1_AFTER_NESTED_INTENT_ID
			}
		}
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "after_nested",
		"intent_id": SUB1_AFTER_NESTED_INTENT_ID,
		"question": "",
		"form": {},
		"actions": [{
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
						"text": "Back from nested"
					}
				}]
			}
		}, {
			"_tdActionType": "returnstack",
			"_tdActionId": "return-sub1"
		}]
	}]
});

const nestedSubagentBot = normalizeBot({
	"webhook_enabled": false,
	"language": "en",
	"name": "Nested subagent bot",
	"type": "tilebot",
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "run",
		"intent_id": "30000000-0000-0000-0000-000000000001",
		"question": "\\run",
		"form": {},
		"actions": [{
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
						"text": "Nested subagent done"
					}
				}]
			}
		}, {
			"_tdActionType": "returnstack",
			"_tdActionId": "return-nested"
		}]
	}]
});

const bots_data = {
	"bots": {}
};
bots_data.bots[PARENT_BOT_ID] = parentBot;
bots_data.bots[SUBAGENT_BOT_ID] = subagentBot;
bots_data.bots[NESTED_SUBAGENT_BOT_ID] = nestedSubagentBot;

module.exports = {
	bots_data,
	PARENT_BOT_ID,
	SUBAGENT_BOT_ID,
	NESTED_SUBAGENT_BOT_ID
};
