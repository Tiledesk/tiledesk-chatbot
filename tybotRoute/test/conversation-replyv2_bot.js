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
                    "_tdActionType": "reply",
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
            "intent_id": "4951f9d7-9561-4bd5-b0df-c5d24178978a",
            "intent_display_name": "defaultFallback",
            "language": "en",
            "attributes": {
                "position": {
                    "x": 239,
                    "y": 600
                },
                "nextBlockAction": {
                    "_tdActionTitle": "",
                    "_tdActionId": "f4444801-fcc3-404d-80fa-38aa619065fb",
                    "_tdActionType": "intent"
                }
            }
        },
        {
            "webhook_enabled": false,
            "enabled": true,
            "actions": [
                {
                    "_tdActionType": "intent",
                    "intentName": "#ec32b4e7-e915-4024-a632-3b8e533bb78c",
                    "_tdActionId": "455a3e13ac0b4c0692edda6569b9c5da"
                }
            ],
            "intent_id": "769c9f38-f2c8-47a5-aa20-945ce01cd739",
            "question": "",
            "intent_display_name": "start",
            "language": "en",
            "attributes": {
                "position": {
                    "x": 172,
                    "y": 384
                },
                "nextBlockAction": {
                    "_tdActionTitle": "",
                    "_tdActionId": "5a773da8-5cb3-4a0b-8671-1aa2758174d1",
                    "_tdActionType": "intent"
                }
            }
        },
        {
            "webhook_enabled": false,
            "enabled": true,
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
                                    "text": "Hi, how can I help you?",
                                    "attributes": {
                                        "attachment": {
                                            "type": "template",
                                            "buttons": [
                                                {
                                                    "uid": "14cb08d984204fe4b28e51bc18dee98a",
                                                    "type": "action",
                                                    "value": "Buttons",
                                                    "link": "",
                                                    "target": "blank",
                                                    "action": "#3043ab48-9dd5-4a40-959d-fb2b6a84f2f9",
                                                    "attributes": "",
                                                    "show_echo": true
                                                },
                                                {
                                                    "uid": "aca11c7003114ba4b5947d8d36bf081a",
                                                    "type": "action",
                                                    "value": "nomatch",
                                                    "link": "",
                                                    "target": "blank",
                                                    "action": "#4951f9d7-9561-4bd5-b0df-c5d24178978a",
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
                }
            ],
            "intent_id": "ec32b4e7-e915-4024-a632-3b8e533bb78c",
            "intent_display_name": "welcome",
            "language": "en",
            "attributes": {
                "position": {
                    "x": 714,
                    "y": 113
                },
                "nextBlockAction": {
                    "_tdActionTitle": "",
                    "_tdActionId": "ee1ddfa8-5242-4c63-a89d-75d7d97813df",
                    "_tdActionType": "intent"
                }
            }
        },
        {
            "webhook_enabled": false,
            "enabled": true,
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
                                                },
                                                {
                                                    "uid": "7c875d7ea2fd46d490a221599fa12d2f",
                                                    "type": "action",
                                                    "value": "nomatch",
                                                    "link": "",
                                                    "target": "blank",
                                                    "action": "",
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
                },
                {
                    "_tdActionTitle": "",
                    "_tdActionId": "cd9d6ad7-e71c-44c8-af11-5fc1d2be3c38",
                    "_tdActionType": "jsoncondition",
                    "groups": [
                        {
                            "type": "expression",
                            "conditions": [
                                {
                                    "type": "condition",
                                    "operand1": "lastUserText",
                                    "operator": "equalAsStrings",
                                    "operand2": {
                                        "type": "const",
                                        "value": "ciaone",
                                        "name": ""
                                    }
                                }
                            ]
                        }
                    ],
                    "stopOnConditionMet": true,
                    "trueIntent": "#7d267ada-f3ca-4aa0-999f-8d3c55d84a32",
                    "falseIntent": null
                }
            ],
            "language": "en",
            "intent_display_name": "buttons",
            "intent_id": "3043ab48-9dd5-4a40-959d-fb2b6a84f2f9",
            "attributes": {
                "position": {
                    "x": 707,
                    "y": 510
                },
                "nextBlockAction": {
                    "_tdActionTitle": "",
                    "_tdActionId": "ee1ddfa8-5242-4c63-a89d-75d7d97813df",
                    "_tdActionType": "intent",
                    "intentName": "#4951f9d7-9561-4bd5-b0df-c5d24178978a"
                }
            }
        },
        {
            "webhook_enabled": false,
            "enabled": true,
            "actions": [
                {
                    "_tdActionTitle": "",
                    "_tdActionId": "78f492af-245d-4f56-8bde-9fcd6824d494",
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
            "intent_id": "59156fb9-f724-4067-9590-58ba9789152e",
            "attributes": {
                "position": {
                    "x": 1357,
                    "y": 271
                },
                "nextBlockAction": {
                    "_tdActionId": "7de6998f-7b3d-4190-b630-68c8df0dc569",
                    "_tdActionType": "intent",
                    "intentName": ""
                }
            }
        },
        {
            "webhook_enabled": false,
            "enabled": true,
            "actions": [
                {
                    "_tdActionTitle": "",
                    "_tdActionId": "c3507d15-98d6-45a9-ade7-8eea299fd87d",
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
                                    "text": "option two",
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
            "intent_display_name": "two",
            "intent_id": "e72fcfad-33ed-498f-864b-4707bbc94df8",
            "attributes": {
                "position": {
                    "x": 1366,
                    "y": 468
                },
                "nextBlockAction": {
                    "_tdActionId": "395f44ab-c84c-4c06-8683-65af391479d2",
                    "_tdActionType": "intent",
                    "intentName": ""
                }
            }
        },
        {
            "webhook_enabled": false,
            "enabled": true,
            "actions": [
                {
                    "_tdActionTitle": "",
                    "_tdActionId": "9fa7d94a-7825-455e-824d-b382389ad68f",
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
                                    "text": "well said, ciaone!",
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
            "intent_display_name": "untitled_block_1",
            "intent_id": "7d267ada-f3ca-4aa0-999f-8d3c55d84a32",
            "attributes": {
                "position": {
                    "x": 1341,
                    "y": 1183
                },
                "nextBlockAction": {
                    "_tdActionId": "3d3b51a7-5f46-41a3-b10b-9a57ed017772",
                    "_tdActionType": "intent",
                    "intentName": ""
                }
            }
        },
        {
            "webhook_enabled": false,
            "enabled": true,
            "actions": [
                {
                    "_tdActionTitle": "",
                    "_tdActionId": "f4939404-57f6-4b4b-b7d9-ba768c2c7cba",
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
                                    "text": "questa risposta non è corretta. dovevi dire ciaone. riprova dai",
                                    "attributes": {
                                        "attachment": {
                                            "type": "template",
                                            "buttons": [
                                                {
                                                    "uid": "88878eba17d04867b224d1476b0bbf68",
                                                    "type": "action",
                                                    "value": "riprova",
                                                    "link": "",
                                                    "target": "blank",
                                                    "action": "#3043ab48-9dd5-4a40-959d-fb2b6a84f2f9",
                                                    "attributes": "",
                                                    "show_echo": true
                                                }
                                            ]
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }
            ],
            "language": "en",
            "intent_display_name": "untitled_block_2",
            "intent_id": "3346e71f-686e-4312-b941-1c21cf37803c",
            "attributes": {
                "position": {
                    "x": 951,
                    "y": 1344
                },
                "nextBlockAction": {
                    "_tdActionId": "244efad7-c39d-4cc2-99b3-3cb32de8e9da",
                    "_tdActionType": "intent",
                    "intentName": ""
                }
            }
        },
        {
            "webhook_enabled": false,
            "enabled": true,
            "actions": [
                {
                    "_tdActionTitle": "",
                    "_tdActionId": "bef75b6f-b82b-453c-9d92-ee6a5f702e9c",
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
                                    "text": "I'm closing the conversation because of no interaction",
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
            "intent_display_name": "noinput",
            "intent_id": "83dd82a3-fa4b-4c46-8ad3-4f355cff2be8",
            "attributes": {
                "position": {
                    "x": 1416,
                    "y": 928
                },
                "nextBlockAction": {
                    "_tdActionId": "c46b58ae-62ed-4fd8-ad72-7706b01212c7",
                    "_tdActionType": "intent",
                    "intentName": ""
                },
                "connectors": {}
            }
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