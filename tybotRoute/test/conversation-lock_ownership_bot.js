function reply(actionId, text) {
  return {
    "_tdActionType": "reply",
    "_tdActionId": actionId,
    "text": text,
    "attributes": {
      "commands": [
        { "type": "wait", "time": 10 },
        { "type": "message", "message": { "type": "text", "text": text } }
      ]
    }
  };
}

function replyV2WithButton(actionId, text) {
  return {
    "_tdActionType": "replyv2",
    "_tdActionId": actionId,
    "noMatchIntent": "#rv_nomatch-id",
    "attributes": {
      "disableInputMessage": false,
      "commands": [
        { "type": "wait", "time": 10 },
        {
          "type": "message",
          "message": {
            "type": "text",
            "text": text,
            "attributes": {
              "attachment": {
                "type": "template",
                "buttons": [
                  { "uid": "btn1", "type": "action", "value": "Go", "link": "", "target": "blank", "action": "#rv_done-id", "attributes": "", "show_echo": true }
                ]
              }
            }
          }
        }
      ]
    }
  };
}

function capture(actionId, goTo, assignTo) {
  return {
    "_tdActionType": "capture_user_reply",
    "_tdActionId": actionId,
    "goToIntent": goTo,
    "assignResultTo": assignTo
  };
}

function block(name, id, actions) {
  return {
    "webhook_enabled": false, "enabled": true, "language": "en",
    "intent_display_name": name, "intent_id": id, "actions": actions
  };
}

const intents = [
  block("a", "a-id", [reply("a1", "question A?"), capture("a2", "#a_done-id", "ans_a")]),
  block("a_done", "a_done-id", [reply("a3", "A: {{ans_a}}")]),
  block("b", "b-id", [reply("b1", "question B?"), capture("b2", "#b_done-id", "ans_b")]),
  block("b_done", "b_done-id", [reply("b3", "B: {{ans_b}}")]),
  block("rv", "rv-id", [replyV2WithButton("r1", "choose")]),
  block("rv_nomatch", "rv_nomatch-id", [reply("r3", "rv nomatch")]),
  block("rv_done", "rv_done-id", [reply("r2", "rv done")])
];

const bot = { "webhook_enabled": false, "language": "en", "name": "Lock ownership", "type": "tilebot" };
bot.intents = {};
bot.intents_by_intent_id = {};
for (const i of intents) {
  bot.intents[i.intent_display_name] = i;
  bot.intents_by_intent_id[i.intent_id] = i;
}
bot.questions_intent = {};

const bots_data = { "bots": {} };
bots_data.bots["botID"] = bot;

module.exports = { bots_data: bots_data };
