const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "Qapla Query",
	"type": "tilebot",
	"attributes": {
		"variables": {
			"qapla_track_num": "qapla_track_num",
			"track_status": "track_status"
		}
	},
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "",
			"_tdActionId": "4c04c334-b87d-4931-9d0e-57a7378936bd",
			"url": "https://api.qapla.it/1.2/getShipment/?apiKey=3b9839c954168e861f2b63d79920ec3a3ff92aab674de9f3930df60b8a40c495&trackingNumber=NL588228465BR",
			"headersString": {
				"Content-Type": "application/json",
				"Cache-Control": "no-cache",
				"User-Agent": "TiledeskBotRuntime",
				"Accept": "*/*"
			},
			"jsonBody": "{}",
			"assignTo": "",
			"assignments": {
				"track_status": "getShipment.shipments.[0].status.qaplaStatus.status"
			},
			"method": "GET",
			"_tdActionType": "webrequest"
		}, {
			"_tdActionTitle": "",
			"_tdActionId": "e34cf93d-2c14-44b8-b45a-8250a34dd7c1",
			"_tdActionType": "reply",
			"attributes": {
				"disableInputMessage": false,
				"commands": [{
					"type": "wait",
					"time": 500
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "Il tuo stato: ${track_status}"
					}
				}]
			},
			"text": "Il tuo stato: ${track_status}\r\n"
		}],
		"question": "\\start",
		"intent_display_name": "start",
		"language": "en",
		"intent_id": "270fcec7-3b8f-465b-bcce-830c936a8584"
	}]
}

// normalize the bot structure for the static intent search
let intents = bot.intents;
delete bot.intents;
// console.log ("bot still is", JSON.stringify(bot));
// console.log ("bintents still are", intents[0]);
intent_dict = {};
for (let i = 0; i < intents.length; i++) {
  intent_dict[intents[i].intent_display_name] = intents[i];
}
bot.intents = intent_dict;
const bots_data = {
  "bots": {}
}
bots_data.bots["botID"] = bot;

module.exports = { bots_data: bots_data };