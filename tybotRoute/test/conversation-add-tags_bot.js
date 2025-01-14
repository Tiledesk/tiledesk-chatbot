const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Your bot",
	"type": "tilebot",
	"intents": [
		// block with tags - for request - without pushing to list
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
			  {
				"_tdActionTitle": "",
				"_tdActionId": "b826bd1f-782f-48e2-9cda-cc2869d3b597",
				"_tdActionType": "add_tags",
				"target": "request",
				"tags": "tag1,tag2",
				"pushToList": false
			  }
			],
			"language": "en",
			"intent_display_name": "add_tags_complete_for_request",
			"intent_id": "0445119a-8a7e-46ff-9cb2-d7d698fc8b64",
			"attributes": {
			  "position": {
				"x": 333,
				"y": 68.5
			  },
			  "nextBlockAction": {
				"_tdActionId": "49150f1f-ddb9-497f-86e7-ec5c29a60f13",
				"_tdActionType": "intent",
				"intentName": ""
			  }
			}
		},
		// block with tags and dyamic variable - for request - without pushing to list
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
			  {
				"_tdActionTitle": "",
				"_tdActionId": "b826bd1f-782f-48e2-9cda-cc2869d3b597",
				"_tdActionType": "add_tags",
				"target": "request",
				"tags": "tag1,tag2,{{dynamic_tag}}",
				"pushToList": false
			  }
			],
			"language": "en",
			"intent_display_name": "add_tags_complete_for_request_and_var",
			"intent_id": "0445119a-8a7e-46ff-9cb2-d7d698fc8b64",
			"attributes": {
			  "position": {
				"x": 333,
				"y": 68.5
			  },
			  "nextBlockAction": {
				"_tdActionId": "49150f1f-ddb9-497f-86e7-ec5c29a60f13",
				"_tdActionType": "intent",
				"intentName": ""
			  }
			}
		},
		// block with tags - for request - with push to list
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
			  {
				"_tdActionTitle": "",
				"_tdActionId": "b826bd1f-782f-48e2-9cda-cc2869d3b597",
				"_tdActionType": "add_tags",
				"target": "request",
				"tags": "tag1,tag2",
				"pushToList": true
			  }
			],
			"language": "en",
			"intent_display_name": "add_tags_complete_for_request_and_push_tags",
			"intent_id": "0445119a-8a7e-46ff-9cb2-d7d698fc8b64",
			"attributes": {
			  "position": {
				"x": 333,
				"y": 68.5
			  },
			  "nextBlockAction": {
				"_tdActionId": "49150f1f-ddb9-497f-86e7-ec5c29a60f13",
				"_tdActionType": "intent",
				"intentName": ""
			  }
			}
		},
		// block with tags and dyamic variable - for request - with push to list
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
			  {
				"_tdActionTitle": "",
				"_tdActionId": "b826bd1f-782f-48e2-9cda-cc2869d3b597",
				"_tdActionType": "add_tags",
				"target": "request",
				"tags": "tag1,tag2,{{dynamic_tag}}",
				"pushToList": true
			  }
			],
			"language": "en",
			"intent_display_name": "add_tags_complete_for_request_with_var_and_push_tags",
			"intent_id": "0445119a-8a7e-46ff-9cb2-d7d698fc8b64",
			"attributes": {
			  "position": {
				"x": 333,
				"y": 68.5
			  },
			  "nextBlockAction": {
				"_tdActionId": "49150f1f-ddb9-497f-86e7-ec5c29a60f13",
				"_tdActionType": "intent",
				"intentName": ""
			  }
			}
		},
		// block with tags - for lead - without pushing to list
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
			  {
				"_tdActionTitle": "",
				"_tdActionId": "b826bd1f-782f-48e2-9cda-cc2869d3b597",
				"_tdActionType": "add_tags",
				"target": "lead",
				"tags": "tag1,tag2",
				"pushToList": false
			  }
			],
			"language": "en",
			"intent_display_name": "add_tags_complete_for_lead",
			"intent_id": "0445119a-8a7e-46ff-9cb2-d7d698fc8b64",
			"attributes": {
			  "position": {
				"x": 333,
				"y": 68.5
			  },
			  "nextBlockAction": {
				"_tdActionId": "49150f1f-ddb9-497f-86e7-ec5c29a60f13",
				"_tdActionType": "intent",
				"intentName": ""
			  }
			}
		},
		// block with tags - for lead - and pushing to list
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
			  {
				"_tdActionTitle": "",
				"_tdActionId": "b826bd1f-782f-48e2-9cda-cc2869d3b597",
				"_tdActionType": "add_tags",
				"target": "lead",
				"tags": "tag1,tag2",
				"pushToList": true
			  }
			],
			"language": "en",
			"intent_display_name": "add_tags_complete_for_lead_and_push",
			"intent_id": "0445119a-8a7e-46ff-9cb2-d7d698fc8b64",
			"attributes": {
			  "position": {
				"x": 333,
				"y": 68.5
			  },
			  "nextBlockAction": {
				"_tdActionId": "49150f1f-ddb9-497f-86e7-ec5c29a60f13",
				"_tdActionType": "intent",
				"intentName": ""
			  }
			}
		},
		// block with EMPTY tags - for lead - and pushing to list
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
			  {
				"_tdActionTitle": "",
				"_tdActionId": "b826bd1f-782f-48e2-9cda-cc2869d3b597",
				"_tdActionType": "add_tags",
				"target": "lead",
				"tags": "",
				"pushToList": true
			  }
			],
			"language": "en",
			"intent_display_name": "add_empty_tags_complete_for_lead_and_push",
			"intent_id": "0445119a-8a7e-46ff-9cb2-d7d698fc8b64",
			"attributes": {
			  "position": {
				"x": 333,
				"y": 68.5
			  },
			  "nextBlockAction": {
				"_tdActionId": "49150f1f-ddb9-497f-86e7-ec5c29a60f13",
				"_tdActionType": "intent",
				"intentName": "NEXT_BLOCK"
			  }
			}
		},
		//SUCCESS
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
			  {
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
							"text": "add tags replied: {{flowError}}"
						}
					}]
				}
			}
			],
			"language": "en",
			"intent_display_name": "NEXT_BLOCK",
			"intent_id": "0445119a-8a7e-46ff-9cb2-d7d698fc8b61",
			"attributes": {
			  "position": {
				"x": 333,
				"y": 68.5
			  },
			  "nextBlockAction": {
				"_tdActionId": "49150f1f-ddb9-497f-86e7-ec5c29a60f13",
				"_tdActionType": "intent",
				"intentName": ""
			  }
			}
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