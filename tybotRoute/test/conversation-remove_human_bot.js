function replyV2(actionId, text, buttons) {
  const message = { type: "text", text: text };
  if (buttons) {
    message.attributes = { attachment: { type: "template", buttons: buttons } };
  }
  return {
    "_tdActionType": "replyv2",
    "_tdActionId": actionId,
    "attributes": {
      "disableInputMessage": false,
      "commands": [
        { "type": "wait", "time": 10 },
        { "type": "message", "message": message }
      ]
    }
  };
}

const intents = [
  {
    "webhook_enabled": false, "enabled": true, "language": "en",
    "intent_display_name": "defaultFallback", "intent_id": "fallback-id",
    "actions": [replyV2("fallback-action", "fallback")]
  },
  {
    "webhook_enabled": false, "enabled": true, "language": "en",
    "intent_display_name": "remove", "intent_id": "remove-id",
    "actions": [{
      "_tdActionType": "remove_human",
      "_tdActionId": "remove-action",
      "scope": "all_humans",
      "trueIntent": "#removed-id",
      "falseIntent": "#rmerror-id"
    }]
  },
  {
    "webhook_enabled": false, "enabled": true, "language": "en",
    "intent_display_name": "removed", "intent_id": "removed-id",
    "actions": [replyV2("removed-action", "removed {{removed_humans_count}}")]
  },
  {
    "webhook_enabled": false, "enabled": true, "language": "en",
    "intent_display_name": "rmerror", "intent_id": "rmerror-id",
    "actions": [replyV2("rmerror-action", "remove error|{{flowError}}")]
  }
];

const bot = {
  "webhook_enabled": false,
  "language": "en",
  "name": "Remove human",
  "type": "tilebot"
};

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
bot.questions_intent = {};

const bots_data = { "bots": {} };
bots_data.bots["botID"] = bot;

module.exports = { bots_data: bots_data };
