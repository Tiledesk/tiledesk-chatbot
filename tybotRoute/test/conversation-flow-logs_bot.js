const bot = {
  "webhook_enabled": false,
  "language": "en",
  "name": "Your bot",
  "type": "tilebot",
  "intents": [
    {
      "webhook_enabled": false,
      "enabled": true,
      "actions": [
        {
          "_tdActionTitle": "",
          "_tdActionId": "b826bd1f-782f-48e2-9cda-cc2869d3b597",
          "_tdActionType": "flow_log",
          "level": "info",
          "log": "This is a log"
        },
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
                "text": "Log published"
              }
            }]
          }
        }
      ],
      "language": "en",
      "intent_display_name": "add_log",
      "intent_id": "0445119a-8a7e-46ff-9cb2-d7d698fc8b64",
    },
    {
      "webhook_enabled": false,
      "enabled": true,
      "actions": [
        {
          "_tdActionTitle": "",
          "_tdActionId": "b826bd1f-782f-48e2-9cda-cc2869d3b597",
          "_tdActionType": "flow_log",
          "level": "info",
          "log": "This is a log: {{payload}}"
        },
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
                "text": "Log published"
              }
            }]
          }
        }
      ],
      "language": "en",
      "intent_display_name": "add_log_with_payload",
      "intent_id": "0445119a-8a7e-46ff-9cb2-d7d698fc8b64",
    },
    {
      "webhook_enabled": false,
      "enabled": true,
      "actions": [
        {
          "_tdActionTitle": "",
          "_tdActionId": "b826bd1f-782f-48e2-9cda-cc2869d3b597",
          "_tdActionType": "flow_log",
          "level": "info",
          "log": "This is a log: {{payload | json}}"
        },
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
                "text": "Log published"
              }
            }]
          }
        }
      ],
      "language": "en",
      "intent_display_name": "add_log_with_object_payload",
      "intent_id": "0445119a-8a7e-46ff-9cb2-d7d698fc8b64",
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