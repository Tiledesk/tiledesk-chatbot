// BOT TEST CASE - Move to Agent directive
const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Move to agent test bot",
	"type": "tilebot",
	"intents": [
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "move_to_agent",
			"intent_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
			"question": "",
			"actions": [
				{
					"_tdActionTitle": "Reply before handoff",
					"_tdActionId": "11111111-1111-1111-1111-111111111111",
					"_tdActionType": "reply",
					"attributes": {
						"commands": [{
							"type": "message",
							"message": {
								"type": "text",
								"text": "Moving you to an agent..."
							}
						}]
					}
				},
				{
					"_tdActionTitle": "Move to agent",
					"_tdActionId": "22222222-2222-2222-2222-222222222222",
					"_tdActionType": "agent"
				}
			]
		},
		{
			"webhook_enabled": false,
			"enabled": true,
			"language": "en",
			"intent_display_name": "move_to_agent_with_department",
			"intent_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
			"question": "",
			"actions": [
				{
					"_tdActionTitle": "Reply before handoff",
					"_tdActionId": "33333333-3333-3333-3333-333333333333",
					"_tdActionType": "reply",
					"attributes": {
						"commands": [{
							"type": "message",
							"message": {
								"type": "text",
								"text": "Moving you to Support department..."
							}
						}]
					}
				},
				{
					"_tdActionTitle": "Move to agent with department",
					"_tdActionId": "44444444-4444-4444-4444-444444444444",
					"_tdActionType": "agent",
					"depName": "Support"
				}
			]
		}
	]
};

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
bot.intents_by_intent_id = intents_dict_by_intent_id;

const bots_data = {
	"bots": {}
};
bots_data.bots["botID"] = bot;

module.exports = { bots_data: bots_data };
