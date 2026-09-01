// Fixture for conversation-online_agents_test.js -- ifonlineagentsv2,
// ifonlineagents (v1) and the ifopenhours branches conversation-open_hours_bot.js
// does not reach.
//
// Two shared branch intents, #ONLINE and #OFFLINE, reply with a distinctive
// text so a test can tell which branch the condition took. Intents whose
// condition is expected NOT to branch end with a trailing reply instead: that
// reply is the evidence the directive called back without stopping the flow.
const branchReply = (text) => ({
	"_tdActionId": "branch-reply-" + text,
	"_tdActionType": "reply",
	"attributes": {
		"disableInputMessage": false,
		"commands": [{ "type": "wait", "time": 0 },
		{ "type": "message", "message": { "type": "text", "text": text } }]
	},
	"text": "A chat message will be sent to the visitor"
});

const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "online agents bot",
	"type": "tilebot",
	"intents": [
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "online branch", "intent_id": "ONLINE",
			"actions": [branchReply("online-branch")]
		},
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "offline branch", "intent_id": "OFFLINE",
			"actions": [branchReply("offline-branch")]
		},

		// ---------------------------------------------------- ifonlineagentsv2
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "v2_ignore_hours", "intent_id": "v2-ignore-hours",
			"actions": [{
				"_tdActionId": "v2-ignore-hours-action",
				"_tdActionType": "ifonlineagentsv2",
				"ignoreOperatingHours": true,
				"trueIntent": "#ONLINE",
				"falseIntent": "#OFFLINE"
			}, branchReply("v2-fallthrough")]
		},
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "v2_with_hours", "intent_id": "v2-with-hours",
			"actions": [{
				"_tdActionId": "v2-with-hours-action",
				"_tdActionType": "ifonlineagentsv2",
				"trueIntent": "#ONLINE",
				"falseIntent": "#OFFLINE"
			}, branchReply("v2-fallthrough")]
		},
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "v2_selected_dep", "intent_id": "v2-selected-dep",
			"actions": [{
				"_tdActionId": "v2-selected-dep-action",
				"_tdActionType": "ifonlineagentsv2",
				"ignoreOperatingHours": true,
				"selectedOption": "selectedDep",
				"selectedDepartmentId": "DEP-42",
				"trueIntent": "#ONLINE",
				"falseIntent": "#OFFLINE"
			}, branchReply("v2-fallthrough")]
		},
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "v2_current_dep", "intent_id": "v2-current-dep",
			"actions": [{
				"_tdActionId": "v2-current-dep-action",
				"_tdActionType": "ifonlineagentsv2",
				"ignoreOperatingHours": true,
				"selectedOption": "currentDep",
				"trueIntent": "#ONLINE",
				"falseIntent": "#OFFLINE"
			}, branchReply("v2-fallthrough")]
		},
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "v2_no_intents", "intent_id": "v2-no-intents",
			"actions": [{
				"_tdActionId": "v2-no-intents-action",
				"_tdActionType": "ifonlineagentsv2",
				"ignoreOperatingHours": true
			}, branchReply("v2-no-intents-done")]
		},
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "v2_no_true_intent", "intent_id": "v2-no-true-intent",
			"actions": [{
				"_tdActionId": "v2-no-true-intent-action",
				"_tdActionType": "ifonlineagentsv2",
				"ignoreOperatingHours": true,
				"falseIntent": "#OFFLINE"
			}, branchReply("v2-no-true-done")]
		},
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "v2_no_false_intent", "intent_id": "v2-no-false-intent",
			"actions": [{
				"_tdActionId": "v2-no-false-intent-action",
				"_tdActionType": "ifonlineagentsv2",
				"ignoreOperatingHours": true,
				"trueIntent": "#ONLINE"
			}, branchReply("v2-no-false-done")]
		},

		// ------------------------------------------------------ ifonlineagents
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "v1_agents", "intent_id": "v1-agents",
			"actions": [{
				"_tdActionId": "v1-agents-action",
				"_tdActionType": "ifonlineagents",
				"stopOnConditionMet": true,
				"trueIntent": "#ONLINE",
				"falseIntent": "#OFFLINE"
			}, branchReply("v1-fallthrough")]
		},
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "v1_no_intents", "intent_id": "v1-no-intents",
			"actions": [{
				"_tdActionId": "v1-no-intents-action",
				"_tdActionType": "ifonlineagents"
			}, branchReply("v1-no-intents-done")]
		},
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "v1_true_only", "intent_id": "v1-true-only",
			"actions": [{
				"_tdActionId": "v1-true-only-action",
				"_tdActionType": "ifonlineagents",
				"trueIntent": "#ONLINE"
			}, branchReply("v1-true-only-done")]
		},
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "v1_false_only", "intent_id": "v1-false-only",
			"actions": [{
				"_tdActionId": "v1-false-only-action",
				"_tdActionType": "ifonlineagents",
				"falseIntent": "#OFFLINE"
			}, branchReply("v1-false-only-done")]
		},

		// ---------------------------------------------------------- ifopenhours
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "oh_no_intents", "intent_id": "oh-no-intents",
			"actions": [{
				"_tdActionId": "oh-no-intents-action",
				"_tdActionType": "ifopenhours"
			}, branchReply("oh-no-intents-done")]
		},
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "oh_error", "intent_id": "oh-error",
			"actions": [{
				"_tdActionId": "oh-error-action",
				"_tdActionType": "ifopenhours",
				"stopOnConditionMet": true,
				"trueIntent": "#ONLINE",
				"falseIntent": "#OFFLINE"
			}, branchReply("oh-fallthrough")]
		},
		{
			"webhook_enabled": false, "enabled": true, "language": "en",
			"intent_display_name": "oh_error_true_only", "intent_id": "oh-error-true-only",
			"actions": [{
				"_tdActionId": "oh-error-true-only-action",
				"_tdActionType": "ifopenhours",
				"stopOnConditionMet": true,
				"trueIntent": "#ONLINE"
			}, branchReply("oh-true-only-done")]
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
