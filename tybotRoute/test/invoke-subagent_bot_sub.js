// BOT TEST CASE MAKE
const bot = {
	"_id": "subagent_bot_id",
	"webhook_enabled": false,
	"language": "en",
	"name": "Subagent",
	"slug": "subagent-1",
	"type": "tilebot",
	"subtype": "webhook",
	"intents": [
		// START
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionType": "intent",
					"intentName": "#0d9dd162-5882-4da0-a898-41d209652534",
					"_tdActionId": "97031077aec249589a744442837e2d33",
					"_outline": "none",
					"_isNoFeatured": true
				}
			],
			"id_faq_kb": "69fdd87594c456001308f343",
			"intent_id": "1794229f-59a9-4af1-ad54-dc6dd9ea5881",
			"question": "",
			"intent_display_name": "webhook",
			"language": "en",
			"attributes": {
				"position": { "x": 172, "y": 384 },
				"readonly": true,
				"color": "156,163,205",
				"nextBlockAction": {
					"_tdActionTitle": "",
					"_tdActionId": "ef04b099-d601-45d2-af96-4043ec5401aa",
					"_tdActionType": "intent"
				}
			},
			"agents_available": false
		},

		// WEB REQUEST
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "82b5363f-6992-48d9-b72d-b08f7507bfba",
					"url": "https://jsonplaceholder.org/users?id=1",
					"headersString": {
						"Content-Type": "*/*",
						"Cache-Control": "no-cache",
						"User-Agent": "TiledeskBotRuntime",
						"Accept": "*/*"
					},
					"settings": {
						"timeout": 20000
					},
					"jsonBody": null,
					"bodyType": "none",
					"formData": [],
					"assignStatusTo": "status",
					"assignErrorTo": "error",
					"assignments": {},
					"method": "GET",
					"_tdActionType": "webrequestv2",
					"assignResultTo": "result",
					"_outline": "none",
					"_isNoFeatured": true,
					"trueIntent": "#RETURN_SUCCESS",
					"falseIntent": "#RETURN_ERROR"
				}
			],
			"id_faq_kb": "69fdd87594c456001308f343",
			"language": "en",
			"intent_display_name": "untitled_block_1",
			"intent_id": "0d9dd162-5882-4da0-a898-41d209652534",
			"agents_available": false,
			"attributes": {
				"position": { "x": 633, "y": 150 },
				"nextBlockAction": {
					"_tdActionId": "4fa15c7b-d33d-4a2e-92a9-052c4e9ff3c3",
					"_tdActionType": "intent",
					"intentName": ""
				},
				"connectors": {},
				"color": "156,163,205",
				"readonly": false
			}
		},

		// RETURN SUCCESS
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionType": "return",
					"status": 200,
					"bodyType": "json",
					"payload": "{\n\t\"success\": true,\n\t\"message\": \"Flow finished\",\n        \"body\": {{ result | json }}\n}",
					"_tdActionId": "b631f26254de48ed98580c618f148cb8",
					"_outline": "2px solid rgba(156,163,205, 1)",
					"_isNoFeatured": true
				}],
			"id_faq_kb": "69fdd87594c456001308f343",
			"intent_id": "RETURN_SUCCESS",
			"intent_display_name": "return_success",
			"language": "en",
			"attributes": {
				"position": { "x": 1595, "y": 83 },
				"color": "156,163,205",
				"nextBlockAction": {
					"_tdActionTitle": "",
					"_tdActionId": "8bf552b7-9465-46e8-b0b0-3689c7495b8f",
					"_tdActionType": "intent"
				}
			},
			"agents_available": false
		},

		// RETURN ERROR
		{
			"webhook_enabled": false,
			"enabled": true,
			"actions": [
				{
					"_tdActionTitle": "",
					"_tdActionId": "45189bc0-376d-4fb9-8288-ea3dafff332c",
					"payload": "{\n\t\"success\": false,\n\t\"message\": \"Flow finished with error\"\n}",
					"bodyType": "json",
					"assignTo": "",
					"assignments": {},
					"_tdActionType": "return",
					"_outline": "2px solid rgba(156,163,205, 1)",
					"_isNoFeatured": true,
					"status": "500"
				}
			],
			"id_faq_kb": "69fdd87594c456001308f343",
			"language": "en",
			"intent_display_name": "return_error",
			"intent_id": "RETURN_ERROR",
			"agents_available": false,
			"attributes": {
				"position": { "x": 1660, "y": 507.5 },
				"nextBlockAction": {
					"_tdActionId": "434bd95f-2de4-4624-8336-cce0cb5a3a0f",
					"_tdActionType": "intent",
					"intentName": ""
				},
				"connectors": {},
				"color": "156,163,205",
				"readonly": false
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