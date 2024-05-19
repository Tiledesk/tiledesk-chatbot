const bot = {
    "webhook_enabled": false,
    "language": "en",
    "name": "Reply V2",
    "type": "tilebot",
    "intents": [
        {
            "webhook_enabled": false,
            "enabled": true,
            "actions": [
                {
                    "_tdActionType": "replyv2",
                    "text": "I didn't understand. Can you rephrase your question?",
                    "attributes": {
                        "commands": [
                            {
                                "type": "wait",
                                "time": 500
                            },
                            {
                                "type": "message",
                                "message": {
                                    "type": "text",
                                    "text": "I didn't understand. Can you rephrase your question?",
                                    "attributes": {
                                        "attachment": {
                                            "type": "template",
                                            "buttons": []
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    "_tdActionId": "d23366ee19b74432a9cd3514af028f59"
                }
            ],
            "intent_display_name": "defaultFallback",
            "language": "en"
        },
        {
            "webhook_enabled": false,
            "enabled": true,
			"intent_display_name": "buttons",
            "intent_id": "3043ab48-9dd5-4a40-959d-fb2b6a84f2f9",
            "actions": [
                {
                    "_tdActionType": "replyv2",
					"noMatchIntent": "no-matching-button",
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
                                            ]
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    "text": "Hi, how can I help you?\r\n",
                    "_tdActionId": "86fe81b2cdba4b84ae7c6eb88335581a"
                },
                {
                    "_tdActionTitle": "",
                    "_tdActionId": "d9f820f7-e58e-4b93-a959-9a9331d83d90",
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
                                    "text": "no match, never displayed in this test",
                                    "attributes": {
                                        "attachment": {
                                            "type": "template",
                                            "buttons": []
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }
            ],
            "language": "en"
        },
		{
            "webhook_enabled": false,
            "enabled": true,
            "actions": [
                {
                    "_tdActionTitle": "",
                    "_tdActionId": "no-matching-button-reply-action",
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
                                    "text": "no matching button text found"
                                }
                            }
                        ]
                    }
                }
            ],
            "language": "en",
            "intent_display_name": "no-matching-button",
            "intent_id": "no-matching-button"
        },
        {
            "webhook_enabled": false,
            "enabled": true,
            "actions": [
                {
                    "_tdActionTitle": "",
                    "_tdActionId": "78f492af-245d-4f56-8bde-9fcd6824d494",
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
                                    "text": "option one",
                                    "attributes": {
                                        "attachment": {
                                            "type": "template",
                                            "buttons": []
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }
            ],
            "language": "en",
            "intent_display_name": "one",
            "intent_id": "59156fb9-f724-4067-9590-58ba9789152e"
        },
        {
            "webhook_enabled": false,
            "enabled": true,
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
                                            ]
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    "text": "Hi, how can I help you?\r\n",
                    "_tdActionId": "86fe81b2cdba4b84ae7c6eb88335581a"
                },
                {
                    "_tdActionTitle": "",
                    "_tdActionId": "d9f820f7-e58e-4b93-a959-9a9331d83d90",
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
                                    "text": "no match, continue",
                                    "attributes": {
                                        "attachment": {
                                            "type": "template",
                                            "buttons": []
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }
            ],
            "language": "en",
            "intent_display_name": "buttons-without-nomatch",
            "intent_id": "3043ab48-9dd5-4a40-959d-fb2b6a84f2f9"
        },
        {
            "webhook_enabled": false,
            "enabled": true,
            "actions": [
                {
                    "_tdActionTitle": "",
                    "_tdActionId": "e4022604-2575-4b55-8a87-6d8c502cd32f",
                    "_tdActionType": "askgptv2",
                    "question": "{{last_user_text}}",
                    "assignReplyTo": "kb_reply",
                    "assignSourceTo": "kb_source",
                    "max_tokens": 512,
                    "temperature": 0.7,
                    "top_k": 5,
                    "model": "gpt-4",
                    "preview": []
                }
            ],
            "language": "en",
            "intent_display_name": "untitled_block_3",
            "intent_id": "a3f68973-e738-4af8-b5e8-c016061e82b2",
            "attributes": {
                "position": {
                    "x": 515.3790532200121,
                    "y": 1162.3147769982393
                },
                "nextBlockAction": {
                    "_tdActionId": "a7586165-436d-4719-81f4-21216b077aff",
                    "_tdActionType": "intent",
                    "intentName": ""
                }
            }
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