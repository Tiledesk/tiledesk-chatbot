// Fixture for conversation-agent_routing_test.js -- the directives/agents
// routing family: agent (move to a human), move_to_unassigned, close and
// department.
//
// Every intent ends with a reply, which is how each test proves the directive
// invoked its callback and the flow continued instead of stalling.
const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "agent routing bot",
	"type": "tilebot",
	"intents": [
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{ "_tdActionId": "to-agent", "_tdActionType": "agent" },
				{
					"_tdActionId": "to-agent-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "agent-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "to_agent",
			"intent_id": "to-agent-intent"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{ "_tdActionId": "to-unassigned", "_tdActionType": "move_to_unassigned" },
				{
					"_tdActionId": "to-unassigned-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "unassigned-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "to_unassigned",
			"intent_id": "to-unassigned-intent"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{ "_tdActionId": "close-conv", "_tdActionType": "close" },
				{
					"_tdActionId": "close-conv-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "close-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "close_conversation",
			"intent_id": "close-conv-intent"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "to-department",
					"_tdActionType": "department",
					"depName": "Sales",
					"triggerBot": false
				},
				{
					"_tdActionId": "to-department-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "dep-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "to_department",
			"intent_id": "to-department-intent"
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionId": "to-department-trigger",
					"_tdActionType": "department",
					"depName": "Support",
					"triggerBot": true
				},
				{
					"_tdActionId": "to-department-trigger-reply",
					"_tdActionType": "reply",
					"attributes": {
						"disableInputMessage": false,
						"commands": [{ "type": "wait", "time": 0 },
						{ "type": "message", "message": { "type": "text", "text": "dep-trigger-done" } }]
					},
					"text": "A chat message will be sent to the visitor"
				}
			],
			"language": "en",
			"intent_display_name": "to_department_trigger",
			"intent_id": "to-department-trigger-intent"
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
