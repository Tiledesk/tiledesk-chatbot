// Due bot con GLI STESSI blocchi e GLI STESSI campi di destinazione vuoti, e la stessa lista di
// connettori negli attributi: quello V3 (dsVersion) segue la lista, quello V2 la ignora.
const START_ID = "11111111-1111-1111-1111-111111111111";
const SECOND_ID = "22222222-2222-2222-2222-222222222222";
const JUMP_ID = "33333333-3333-3333-3333-333333333333";
const THIRD_ID = "44444444-4444-4444-4444-444444444444";
const MENU_ID = "55555555-5555-5555-5555-555555555555";

function intents() {
	return [{
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "start",
		"intent_id": START_ID,
		"actions": [{
			"_tdActionType": "reply",
			"_tdActionId": "reply_start",
			"text": "Start",
			"attributes": {
				"commands": [{ "type": "wait", "time": 100 }, { "type": "message", "message": { "type": "text", "text": "Start" } }]
			}
		}],
		"attributes": {
			"nextBlockAction": {
				"_tdActionType": "intent",
				"_tdActionId": "next_start",
				"intentName": ""
			}
		}
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "second_block",
		"intent_id": SECOND_ID,
		"actions": [{
			"_tdActionType": "reply",
			"_tdActionId": "reply_second",
			"text": "Block connected!",
			"attributes": {
				"commands": [{ "type": "wait", "time": 100 }, { "type": "message", "message": { "type": "text", "text": "Block connected!" } }]
			}
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "jump",
		"intent_id": JUMP_ID,
		"actions": [{
			"_tdActionType": "connect_block",
			"_tdActionId": "cb_jump",
			"intentName": ""
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "menu",
		"intent_id": MENU_ID,
		"actions": [{
			"_tdActionType": "replyv2",
			"_tdActionId": "reply_menu",
			"text": "Pick one",
			"attributes": {
				"disableInputMessage": false,
				"commands": [{ "type": "wait", "time": 100 }, { "type": "message", "message": { "type": "text", "text": "Pick one", "attributes": { "attachment": { "type": "template", "buttons": [
					{ "uid": "btn_go", "type": "action", "value": "Go third", "show_echo": true },
					{ "uid": "btn_txt", "type": "text", "value": "Just text" }
				] } } } }]
			}
		}]
	}, {
		"webhook_enabled": false,
		"enabled": true,
		"language": "en",
		"intent_display_name": "third_block",
		"intent_id": THIRD_ID,
		"actions": [{
			"_tdActionType": "reply",
			"_tdActionId": "reply_third",
			"text": "Third reached!",
			"attributes": {
				"commands": [{ "type": "wait", "time": 100 }, { "type": "message", "message": { "type": "text", "text": "Third reached!" } }]
			}
		}]
	}];
}

const connectors = {
	"version": 1,
	"updatedAt": "2026-10-12T00:00:00.000Z",
	"items": [{
		"id": START_ID + "/next_start/" + SECOND_ID,
		"from": { "intentId": START_ID, "actionId": "next_start", "slot": "next" },
		"to": { "intentId": SECOND_ID },
		"kind": "block"
	}, {
		"id": MENU_ID + "/reply_menu/btn_go/" + THIRD_ID,
		"from": { "intentId": MENU_ID, "actionId": "reply_menu", "slot": "button:btn_go" },
		"to": { "intentId": THIRD_ID },
		"kind": "button",
		"props": { "params": "{\"from\":\"menu\"}" }
	}, {
		"id": JUMP_ID + "/cb_jump/" + THIRD_ID,
		"from": { "intentId": JUMP_ID, "actionId": "cb_jump", "slot": "default" },
		"to": { "intentId": THIRD_ID },
		"kind": "action"
	}]
};

function normalizeBot(bot) {
	const list = bot.intents;
	delete bot.intents;
	const by_name = {}, by_id = {};
	for (const intent of list) { by_name[intent.intent_display_name] = intent; by_id[intent.intent_id] = intent; }
	bot.intents = by_name;
	bot.intents_by_intent_id = by_id;
	return bot;
}

const v3bot = normalizeBot({
	"webhook_enabled": false, "language": "en", "name": "connectors v3", "type": "tilebot",
	"attributes": { "dsVersion": "v3", "connectors": JSON.parse(JSON.stringify(connectors)) },
	"intents": intents()
});
const v2bot = normalizeBot({
	"webhook_enabled": false, "language": "en", "name": "connectors v2 control", "type": "tilebot",
	"attributes": { "connectors": JSON.parse(JSON.stringify(connectors)) },
	"intents": intents()
});

// Un V3 con la lista VUOTA e le destinazioni ancora nei campi (flusso importato, lista mai
// riscritta): la lista non toglie nulla, il motore segue i campi.
function filledIntents() {
	const list = intents();
	list[0].attributes.nextBlockAction.intentName = "#" + SECOND_ID;
	list[2].actions[0].intentName = "#" + THIRD_ID;
	list[3].actions[0].attributes.commands[1].message.attributes.attachment.buttons[0].action = "#" + THIRD_ID;
	return list;
}
const v3filledbot = normalizeBot({
	"webhook_enabled": false, "language": "en", "name": "connectors v3 empty list", "type": "tilebot",
	"attributes": { "dsVersion": "v3", "connectors": { "version": 1, "updatedAt": "2026-10-14T00:00:00.000Z", "items": [] } },
	"intents": filledIntents()
});

const bots_data = { "bots": {} };
bots_data.bots["v3botID"] = v3bot;
bots_data.bots["v2botID"] = v2bot;
bots_data.bots["v3filledID"] = v3filledbot;

module.exports = { bots_data: bots_data, ids: { START_ID, SECOND_ID, JUMP_ID, THIRD_ID, MENU_ID } };
