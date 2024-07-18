const bot = {
	"webhook_enabled": false,
	"language": "en",
	"name": "coding",
	"type": "tilebot",
	"attributes": {
		"variables": {
			"json_data": "json_data"
		}
	},
	"intents": [{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "",
			"_tdActionId": "fe9bff7c-9712-4769-b123-80e7767cb134",
			"_tdActionType": "setattribute",
			"operation": {
				"operands": [{
					"value": "temp_value",
					"isVariable": false
				}],
				"operators": []
			},
			"destination": "json_data"
		}, {
			"_tdActionTitle": "code",
			"_tdActionId": "ca7835b8-319a-4272-8f94-f75c7bcf6f62",
			"_tdActionType": "codev2",
			"source": `
console.log('a var...chatbot_name!', context.attributes.chatbot_name);
context.setAttribute('myvar', '1');
context.deleteAttribute('chatbot_name');
context.deleteAttribute('conversation_id');
`
		}, {
			"_tdActionTitle": "",
			"_tdActionId": "bbc02bfc-ddfb-40c8-af56-680634e45283",
			"_tdActionType": "reply",
			"attributes": {
				"disableInputMessage": false,
				"commands": [{
					"type": "wait"
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "myvar: ${myvar}"
					}
				}]
			},
			"text": "A chat message will be sent to the visitor"
		}],
		"language": "en",
		"intent_display_name": "coding",
		"intent_id": "intent1"
	},
	{
		"webhook_enabled": false,
		"enabled": true,
		"actions": [{
			"_tdActionTitle": "",
			"_tdActionId": "fe9bff7c-9712-4769-b123-80e7767cb134",
			"_tdActionType": "setattribute",
			"operation": {
				"operands": [{
					"value": "temp_value",
					"isVariable": false
				}],
				"operators": []
			},
			"destination": "json_data"
		}, {
			"_tdActionTitle": "code",
			"_tdActionId": "ca7835b8-319a-4272-8f94-f75c7bcf6f62",
			"_tdActionType": "code",
			"source": `
console.log('a var...chatbot_name!', context.attributes.chatbot_name);
context.setAttribute('myvar', '1');
context.deleteAttribute('chatbot_name');
context.deleteAttribute('conversation_id');
context.setAttribute('jsondata2', jsondata2);
`
		}, {
			"_tdActionTitle": "",
			"_tdActionId": "bbc02bfc-ddfb-40c8-af56-680634e45283",
			"_tdActionType": "reply",
			"attributes": {
				"disableInputMessage": false,
				"commands": [{
					"type": "wait"
				}, {
					"type": "message",
					"message": {
						"type": "text",
						"text": "myvar: ${myvar}"
					}
				}]
			},
			"text": "A chat message will be sent to the visitor"
		}],
		"language": "en",
		"intent_display_name": "coding2",
		"intent_id": "intent2"
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