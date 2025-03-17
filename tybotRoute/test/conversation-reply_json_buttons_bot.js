const bot = {
    "webhook_enabled": false,
    "language": "en",
    "name": "Reply V2",
    "type": "tilebot",
    "intents": [
        {
            "webhook_enabled": false,
            "enabled": true,
            "intent_display_name": "json buttons replyv2",
            "intent_id": "3043ab48-9dd5-4a40-959d-fb2b6a84f2f9",
            "actions": [
                {
                    "_tdActionType": "replyv2",
                    "attributes": {
                        "disableInputMessage": false,
                        "commands": [
                            {
                                "type": "wait",
                                "time": 500
                            },
                            {
                                "type": "message",
                                "message": {
                                    "type": "text",
                                    "text": "Please select an option",
                                    "attributes": {
                                        "attachment": {
                                            "type": "template",
                                            "buttons": [
                                                {
                                                    "uid": "323029e9ac4742aa9494c3ce2679b961",
                                                    "type": "action",
                                                    "value": "one",
                                                    "link": "",
                                                    "target": "blank",
                                                    "action": "#59156fb9-f724-4067-9590-58ba9789152e",
                                                    "attributes": "",
                                                    "show_echo": true
                                                },
                                                {
                                                    "uid": "07b8c4e5b82d48f6b6bc83c54925e532",
                                                    "type": "action",
                                                    "value": "two",
                                                    "link": "",
                                                    "target": "blank",
                                                    "action": "#e72fcfad-33ed-498f-864b-4707bbc94df8",
                                                    "attributes": "",
                                                    "show_echo": true
                                                }
                                            ],
                                            "json_buttons": '[{"type":"action","value":"Button1","action":"#action_id","alias":"button1 alias"},{"type":"text","value":"Button2 text"},{"type":"url","value":"Button3 link","link":"http://"}]'
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    "text": "json buttons reply",
                    "_tdActionId": "86fe81b2cdba4b84ae7c6eb88335581a"
                }
            ],
            "language": "en"
        },
        {
            "webhook_enabled": false,
            "enabled": true,
            "intent_display_name": "json buttons reply",
            "intent_id": "fb2b6a84f2f9",
            "actions": [
                {
                    "_tdActionType": "reply",
                    "attributes": {
                        "disableInputMessage": false,
                        "commands": [
                            {
                                "type": "wait",
                                "time": 500
                            },
                            {
                                "type": "message",
                                "message": {
                                    "type": "text",
                                    "text": "Please select an option",
                                    "attributes": {
                                        "attachment": {
                                            "type": "template",
                                            "buttons": [
                                                {
                                                    "uid": "323029e9ac4742aa9494c3ce2679b961",
                                                    "type": "action",
                                                    "value": "one",
                                                    "link": "",
                                                    "target": "blank",
                                                    "action": "#59156fb9-f724-4067-9590-58ba9789152e",
                                                    "attributes": "",
                                                    "show_echo": true
                                                },
                                                {
                                                    "uid": "07b8c4e5b82d48f6b6bc83c54925e532",
                                                    "type": "action",
                                                    "value": "two",
                                                    "link": "",
                                                    "target": "blank",
                                                    "action": "#e72fcfad-33ed-498f-864b-4707bbc94df8",
                                                    "attributes": "",
                                                    "show_echo": true
                                                }
                                            ],
                                            "json_buttons": '[{"type":"action","value":"Button1","action":"#action_id","alias":"button1 alias"},{"type":"text","value":"Button2 text"},{"type":"url","value":"Button3 link","link":"http://"}]'
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    "text": "json buttons reply",
                    "_tdActionId": "86fe81b2cdba4b84ae7c6eb88335581a"
                }
            ],
            "language": "en"
        },
        {
            "webhook_enabled": false,
            "enabled": true,
            "intent_display_name": "json buttons reply (v2) normal buttons",
            "intent_id": "fb2b6a84f2f9",
            "actions": [
                {
                    "_tdActionType": "replyv2",
                    "attributes": {
                        "disableInputMessage": false,
                        "commands": [
                            {
                                "type": "wait",
                                "time": 500
                            },
                            {
                                "type": "message",
                                "message": {
                                    "type": "text",
                                    "text": "Please select an option",
                                    "attributes": {
                                        "attachment": {
                                            "type": "template",
                                            "buttons": [
                                                {
                                                    "type": "action",
                                                    "value": "one",
                                                    "show_echo": true
                                                },
                                                {
                                                    "type": "action",
                                                    "value": "two",
                                                    "show_echo": true
                                                }
                                            ]
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    "text": "json buttons reply",
                    "_tdActionId": "86fe81b2cdba4b84ae7c6eb88335581a"
                }
            ],
            "language": "en"
        },
        {
            "webhook_enabled": false,
            "enabled": true,
            "intent_display_name": "json buttons reply normal buttons",
            "intent_id": "fb2b6a84f2f9",
            "actions": [
                {
                    "_tdActionType": "reply",
                    "attributes": {
                        "disableInputMessage": false,
                        "commands": [
                            {
                                "type": "wait",
                                "time": 500
                            },
                            {
                                "type": "message",
                                "message": {
                                    "type": "text",
                                    "text": "Please select an option",
                                    "attributes": {
                                        "attachment": {
                                            "type": "template",
                                            "buttons": [
                                                {
                                                    "type": "action",
                                                    "value": "one",
                                                    "show_echo": true
                                                },
                                                {
                                                    "type": "action",
                                                    "value": "two",
                                                    "show_echo": true
                                                }
                                            ]
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    "text": "json buttons reply",
                    "_tdActionId": "86fe81b2cdba4b84ae7c6eb88335581a"
                }
            ],
            "language": "en"
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