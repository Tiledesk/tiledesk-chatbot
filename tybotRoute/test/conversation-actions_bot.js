const bot = {
    "webhook_enabled": false,
    "language": "en",
    "name": "Actions Bot",
    "intents": [{
        "webhook_enabled": false,
        "enabled": true,
        "question": "\\start",
        "answer": "\\_tdmessage Hello by message directive!\\n\\nStart test\\n* /MessageActions\\n* /Message_plus_Agent\\n* /Message_plus_AgentWhenOnline\\n* /Message_plus_Close\\n* /ChangeDepartment\\n* /Intent\\n* /agent-directive\\n* /agent-when-online-directive\\n* /close-directive\\n* /change-department-directive",
        "intent_display_name": "start",
        "language": "en"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "defaultFallback",
        "answer": "I can not provide an adequate answer. Write a new question or talk to a human agent.\n* Back to start tdAction:start\n* See the docs https://docs.tiledesk.com/\n* 👨🏻‍🦰 I want an agent",
        "intent_display_name": "defaultFallback",
        "language": "en"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "***",
        "actions": [{
            "_tdActionType": "message",
            "attributes": {
                "commands": [{
                    "type": "message",
                    "message": {
                        "text": "Hello by message directive!",
                        "type": "text"
                    }
                }, {
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "text": "Ciao",
                        "type": "text",
                        "attributes": {
                            "attachment": {
                                "type": "template",
                                "buttons": [{
                                    "type": "text",
                                    "value": "/start"
                                }]
                            }
                        }
                    }
                }]
            }
        }],
        "language": "en",
        "intent_display_name": "MessageActions"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "***",
        "answer": "***",
        "actions": [{
            "_tdActionType": "message",
            "attributes": {
                "commands": [{
                    "type": "message",
                    "message": {
                        "text": "Moving you to an agent...",
                        "type": "text"
                    }
                }]
            }
        }, {
            "type": "agent"
        }],
        "language": "en",
        "intent_display_name": "Message_plus_Agent"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "***",
        "answer": "***",
        "actions": [{
            "_tdActionType": "message",  
            "attributes": {
                "commands": [{
                    "type": "message",
                    "message": {
                        "text": "Looking for an agent online...",
                        "type": "text"
                    }
                }]
            }
        }, {
            "type": "whenonlinemovetoagent"
        }],
        "language": "en",
        "intent_display_name": "Message_plus_AgentWhenOnline"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "***",
        "answer": "***",
        "actions": [{
            "_tdActionType": "message",
            "attributes": {
                "commands": [{
                    "type": "message",
                    "message": {
                        "text": "Closing...",
                        "type": "text"
                    }
                }]
            }
        }, {
            "type": "close"
        }],
        "language": "en",
        "intent_display_name": "Message_plus_Close"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "***",
        "answer": "***",
        "actions": [
        {
            "_tdActionType": "department",
            "depName": "Support"
        }, {
            "_tdActionType": "message",
            "text": "/start",
            "attributes": {
                "subtype": "info"
            }
        }],
        "language": "en",
        "intent_display_name": "ChangeDepartment"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "***",
        "answer": "***",
        "actions": [{
            "_tdActionType": "intent",
            "intentName": "intentAction"
        }],
        "language": "en",
        "intent_display_name": "Intent"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "***",
        "answer": "Intent Action is ok!\nNow moving to *intentAction2* using **_tdintent intentAction2** directive\n\\_tdintent intentAction2\n",
        "language": "en",
        "intent_display_name": "intentAction"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "***",
        "answer": "Eureka!\nYou got the *intentAction2* reply!\nNow moving to *intentAction3* that will move you to *intentAction4*...\n\\_tdintent intentAction3",
        "language": "en",
        "intent_display_name": "intentAction2"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "****",
        "answer": "Moving to an agent using directive...\n\\_tdagent",
        "language": "en",
        "intent_display_name": "agent-directive"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "***",
        "answer": "Moving to agent if online...\n\\_tdwhenonlinemovetoagent",
        "language": "en",
        "intent_display_name": "agent-when-online-directive"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "***",
        "answer": "Closing chat with _tdclose directive...\n\\_tdclose",
        "language": "en",
        "intent_display_name": "close-directive"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "***",
        "answer": "Moving to 'Support' department...\n\\_tddepartment Support\n\\_tdhmessage /start",
        "language": "en",
        "intent_display_name": "change-department-directive"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "actions": [],
        "question": "***",
        "answer": "\\_tdintent intentAction4",
        "language": "en",
        "intent_display_name": "intentAction3"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "actions": [],
        "question": "***",
        "answer": "Eureka!\nThis is the reply for **intentAction4**\n* /start",
        "language": "en",
        "intent_display_name": "intentAction4"
    }, {
        "webhook_enabled": false,
        "enabled": true,
        "question": "***",
        "actions": [
            
            {
                "_tdActionType": "intent",
                "intentName": "anomaly"
            }
        ],
        "language": "en",
        "intent_display_name": "anomaly"
    }]
}

// normalize the bot structure for the static intent search
let intents = bot.intents;
delete bot.intents;
// console.log ("bot still is", JSON.stringify(bot));
// console.log ("bintents still are", intents[0]);
intent_dict = {};
for (let i = 0; i < intents.length; i++) {
  intent_dict[intents[i].intent_display_name] = intents[i];
}
bot.intents = intent_dict;
const bots_data = {
  "bots": {}
}
bots_data.bots["botID"] = bot;

module.exports = { bots_data: bots_data };