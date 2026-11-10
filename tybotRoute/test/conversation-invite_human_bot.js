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
    "intent_display_name": "invite", "intent_id": "invite-id",
    "actions": [{
      "_tdActionType": "invite_human",
      "_tdActionId": "invite-action",
      "departmentId": "dep-sre",
      "members": "{{oncall}}, ops@acme.it",
      "trueIntent": "#invited-id",
      "falseIntent": "#noone-id"
    }]
  },
  {
    "webhook_enabled": false, "enabled": true, "language": "en",
    "intent_display_name": "invited", "intent_id": "invited-id",
    "actions": [replyV2("ask-approval", "invited {{invited_humans_count}}: restart?", [
      { "uid": "b1", "type": "action", "value": "Approve", "link": "", "target": "blank", "action": "#approved-id", "attributes": "", "show_echo": true },
      { "uid": "b2", "type": "action", "value": "Reject", "link": "", "target": "blank", "action": "#rejected-id", "attributes": "", "show_echo": true }
    ])]
  },
  {
    "webhook_enabled": false, "enabled": true, "language": "en",
    "intent_display_name": "noone", "intent_id": "noone-id",
    "actions": [replyV2("noone-action", "no human available|{{flowError}}")]
  },
  {
    "webhook_enabled": false, "enabled": true, "language": "en",
    "intent_display_name": "approved", "intent_id": "approved-id",
    "actions": [replyV2("approved-action", "approved by {{lastUserMessage.sender}}")]
  },
  {
    "webhook_enabled": false, "enabled": true, "language": "en",
    "intent_display_name": "rejected", "intent_id": "rejected-id",
    "actions": [replyV2("rejected-action", "rejected")]
  }
];

const bot = {
  "webhook_enabled": false,
  "language": "en",
  "name": "Invite human",
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
