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

function capture(actionId) {
  return {
    "_tdActionType": "capture_user_reply",
    "_tdActionId": actionId,
    "goToIntent": "#answered-id",
    "assignResultTo": "answer"
  };
}

function block(name, id, actions) {
  return {
    "webhook_enabled": false, "enabled": true, "language": "en",
    "intent_display_name": name, "intent_id": id, "actions": actions
  };
}

const intents = [
  block("ask", "ask-id", [reply("a1", "question?"), capture("a2"), reply("a3", "must not run")]),
  block("answered", "answered-id", [reply("b1", "answer: {{answer}}")]),
  block("locked_jump", "locked_jump-id", [
    reply("c1", "waiting"),
    capture("c2"),
    { "_tdActionType": "intent", "_tdActionId": "c3", "intentName": "#other-id" }
  ]),
  block("other", "other-id", [reply("d1", "other ran")])
];

const bot = { "webhook_enabled": false, "language": "en", "name": "Lock internal jump", "type": "tilebot" };
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
