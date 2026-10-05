function replyV2(actionId, text) {
  return {
    "_tdActionType": "replyv2",
    "_tdActionId": actionId,
    "attributes": {
      "disableInputMessage": false,
      "commands": [
        { "type": "wait", "time": 10 },
        { "type": "message", "message": { type: "text", text: text } }
      ]
    }
  };
}

const bot = {
  "webhook_enabled": false,
  "language": "en",
  "name": "Start point bot",
  "type": "tilebot",
  "intents": [
    {
      "webhook_enabled": false, "enabled": true, "language": "en",
      "intent_display_name": "start", "intent_id": "start-id",
      "actions": [replyV2("start-action", "web start|{{start_type}}")]
    },
    {
      "webhook_enabled": false, "enabled": true, "language": "en",
      "intent_display_name": "wbox", "intent_id": "wbox-id",
      "actions": [replyV2("wbox-action", "webhook box|{{start_type}}|{{alertname}}")]
    }
  ]
};

// index the intents by display name and by intent id for the static datasource
const intents = bot.intents;
const by_name = {};
const by_id = {};
for (let i = 0; i < intents.length; i++) {
  by_name[intents[i].intent_display_name] = intents[i];
  by_id[intents[i].intent_id] = intents[i];
}
bot.intents = by_name;
bot.intents_by_intent_id = by_id;
bot.questions_intent = {};
const bots_data = { "bots": {} };
bots_data.bots["botID"] = bot;
module.exports = { bots_data: bots_data };
