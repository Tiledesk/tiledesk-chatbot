var assert = require('assert');
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil');
const { Filler } = require('../tiledeskChatbotPlugs/Filler');

describe('Intent name parsing', function() {
  
    it('parsing ""', async () => {
        const explicit_intent_name = "";
        const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
        // console.log("intent:", intent);
        assert(intent === null);
    });

    it('parsing "{}"', async () => {
        const explicit_intent_name = "{}";
        const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
        // console.log("intent:", intent);
        assert(intent.name === "");
        assert(intent.parameters !== null);
    });

    it('parsing "intent_name"', async () => {
        const explicit_intent_name = "intent_name";
        const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
        // console.log("intent:", intent);
        assert(intent !== null);
        assert(intent.name === "intent_name");
        assert(intent.parameters === undefined);
    });

    it('parsing "intent_name{}"', async () => {
        const explicit_intent_name = "intent_name{}";
        const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
        // console.log("intent:", intent);
        assert(intent !== null);
        assert(intent.name === "intent_name");
        assert(intent.parameters !== null);
    });

    it("parsing 'intent_name{valid JSON}'", async () => {
        const explicit_intent_name = 'intent_name{ "name": "myname", "age": 20}';
        const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
        // console.log("intent:", intent);
        assert(intent !== null);
        assert(intent.name === "intent_name");
        assert(intent.parameters !== null);
        assert(intent.parameters.name === "myname");
        assert(intent.parameters.age === 20);
    });
    
});

describe('General features', function() {

    it("valid support-group", async () => {
        const project_id = "projectId1";
        const requestId = "support-group-" + project_id + "-UUID1";
        let isValid = TiledeskChatbotUtil.validateRequestId(requestId, project_id);
        assert(isValid === true);
    });

    it("not valid support-group: wrongProjectId", async () => {
        const project_id = "projectId1";
        const requestId = "support-group-wrongProjectId-UUID1";
        let isValid = TiledeskChatbotUtil.validateRequestId(requestId, project_id);
        assert(isValid === false);
    });

    it("not valid support-group: no UUID", async () => {
        const project_id = "projectId1";
        const requestId = "support-group-" + project_id;
        let isValid = TiledeskChatbotUtil.validateRequestId(requestId, project_id);
        assert(isValid === false);
    });

    it("not valid support-group: no UUID, no -", async () => {
        const project_id = "projectId1";
        const requestId = "support-group" + project_id;
        let isValid = TiledeskChatbotUtil.validateRequestId(requestId, project_id);
        assert(isValid === false);
    });

    it("not valid support-group: wrong prefix", async () => {
        const project_id = "projectId1";
        const requestId = "port-group" + project_id;
        let isValid = TiledeskChatbotUtil.validateRequestId(requestId, project_id);
        assert(isValid === false);
    });

    it("valid automation-request", async () => {
        const project_id = "projectId1";
        const requestId = "automation-request-" + project_id + "-UUID1";
        let isValid = TiledeskChatbotUtil.validateRequestId(requestId, project_id);
        assert(isValid === true);
    });

    it("not valid automation-request: wrongProjectId", async () => {
        const project_id = "projectId1";
        const requestId = "automation-request-wrongProjectId-UUID1";
        let isValid = TiledeskChatbotUtil.validateRequestId(requestId, project_id);
        assert(isValid === false);
    });
    
});

describe('Random reply', function() {
  
    // it('One random reply', async () => {
    //     const message = {
    //         "attributes": {
    //             "disableInputMessage": false,
    //             "commands": [{
    //                 "type": "wait",
    //                 "time": 500
    //             }, {
    //                 "type": "message",
    //                 "message": {
    //                     "type": "text",
    //                     "text": "message1",
    //                     "attributes": {
    //                         "attachment": {
    //                             "type": "template",
    //                             "buttons": [{
    //                                 "value": "Button1",
    //                                 "type": "text",
    //                                 "target": "blank",
    //                                 "link": "",
    //                                 "action": "",
    //                                 "show_echo": true
    //                             }]
    //                         }
    //                     }
    //                 }
    //             }]
    //         }
    //     }
    //     const rnd_commands = TiledeskChatbotUtil.chooseRandomReply(message);
    //     console.log("random reply:", rnd_commands);
    //     assert(rnd_commands.length === 2);
    //     assert(rnd_commands[0].type === "wait");
    //     assert(rnd_commands[0].time === 500);
    //     assert(rnd_commands[1].type === "message");
    //     assert(rnd_commands[1].message.type === "text");
    //     assert(rnd_commands[1].message.text === "message1");
    //     assert(rnd_commands[1].message.attributes !== null);
    //     assert(rnd_commands[1].message.attributes.attachment.type === "template");
    //     assert(rnd_commands[1].message.attributes.attachment.buttons !== null);
    //     assert(rnd_commands[1].message.attributes.attachment.buttons[0].value === "Button1");
    // });

    it('Choose one random reply in a group of four', async () => {
        const message = {
            "attributes": {
                "commands": [{
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "text",
                        "text": "message1",
                        "attributes": {
                            "attachment": {
                                "type": "template",
                                "buttons": [{
                                    "value": "Button1",
                                    "type": "text",
                                    "target": "blank",
                                    "link": "",
                                    "action": "",
                                    "show_echo": true
                                }]
                            }
                        }
                    }
                }, {
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "text",
                        "text": "message2"
                    }
                }, {
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "image",
                        "text": "message3 - image",
                        "metadata": {
                            "src": ""
                        }
                    }
                }, {
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "text",
                        "text": "message4",
                        "attributes": {
                            "attachment": {
                                "type": "template",
                                "buttons": [{
                                    "value": "Button4",
                                    "type": "text",
                                    "target": "blank",
                                    "link": "",
                                    "action": "",
                                    "show_echo": true
                                }]
                            }
                        }
                    }
                }]
            }
        }
        const rnd_commands = TiledeskChatbotUtil.chooseRandomReply(message);
        // console.log("random reply:", rnd_commands);
        assert(rnd_commands.length === 2);
        assert(rnd_commands[0].type === "wait");
        assert(rnd_commands[0].time === 500);
        assert(rnd_commands[1].type === "message");
        assert(rnd_commands[1].message.type === "text" || rnd_commands[1].message.type === "image");
        assert(rnd_commands[1].message.text === "message1" || rnd_commands[1].message.text === "message2" || rnd_commands[1].message.text === "message3 - image" || rnd_commands[1].message.text === "message4");
    });
});

describe('commands.button filler', function() {
  
    it('commands.button: one variable in a link', async () => {
        const command = {
            "type": "message",
            "message": {
                "type": "text",
                "text": "I don't know!",
                "attributes": {
                    "attachment": {
                        "type": "template",
                        "buttons": [{
                            "value": "button text",
                            "type": "url",
                            "target": "blank",
                            "link": "http://testurl.com/${project_id}/detail"
                        }]
                    }
                }
            }
        }
        const vars = {
            "project_id": "009988"
        }
        TiledeskChatbotUtil.fillCommandAttachments(command, vars);
        // console.log("command:", JSON.stringify(command))
        assert(command.message.attributes.attachment.buttons[0].value === "button text");
        assert(command.message.attributes.attachment.buttons[0].type === "url");
        assert(command.message.attributes.attachment.buttons[0].target === "blank");
        assert(command.message.attributes.attachment.buttons[0].link === "http://testurl.com/009988/detail");
    });
    
});

describe('removeEmptyReplyCommands', function() {
  
    // it('One random reply', async () => {
    //     const message = {
    //         "attributes": {
    //             "disableInputMessage": false,
    //             "commands": [{
    //                 "type": "wait",
    //                 "time": 500
    //             }, {
    //                 "type": "message",
    //                 "message": {
    //                     "type": "text",
    //                     "text": "message1"
    //                 }
    //             }]
    //         }
    //     }
    //     const rnd_commands = TiledeskChatbotUtil.chooseRandomReply(message);
    //     console.log("random reply:", rnd_commands);
    //     assert(rnd_commands.length === 2);
    //     assert(rnd_commands[0].type === "wait");
    //     assert(rnd_commands[0].time === 500);
    //     assert(rnd_commands[1].type === "message");
    //     assert(rnd_commands[1].message.type === "text");
    //     assert(rnd_commands[1].message.text === "message1");
    //     assert(rnd_commands[1].message.attributes !== null);
    //     assert(rnd_commands[1].message.attributes.attachment.type === "template");
    //     assert(rnd_commands[1].message.attributes.attachment.buttons !== null);
    //     assert(rnd_commands[1].message.attributes.attachment.buttons[0].value === "Button1");
    // });

    it('Removes the first two empty text commands (out of four)', async () => {
        const message = {
            "attributes": {
                "commands": [{
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "text",
                        "text": "", // EMPTY TEXT
                        "attributes": {
                            "attachment": {
                                "type": "template",
                                "buttons": [{
                                    "value": "Button1",
                                    "type": "text",
                                    "target": "blank",
                                    "link": "",
                                    "action": "",
                                    "show_echo": true
                                }]
                            }
                        }
                    }
                }, {
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "text" // NO TEXT
                    }
                }, {
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "image",
                        "text": "message3 - image",
                        "metadata": {
                            "src": ""
                        }
                    }
                }, {
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "text",
                        "text": "message4"
                    }
                }, {
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "frame",
                        "metadata": {
                            "src": ""
                        }
                    }
                }, {
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "image",
                        "metadata": {
                            "src": ""
                        }
                    }
                }]
            }
        }
        const cleanMessage = TiledeskChatbotUtil.removeEmptyReplyCommands(message);
        console.log("cleanMessage reply:", JSON.stringify(cleanMessage));
        const commands = cleanMessage.attributes.commands;
        console.log("commands reply:", JSON.stringify(commands));
        console.log("commands reply.length:", commands.length);
        assert(commands.length === 8);
        assert(commands[0].type === "wait");
        assert(commands[0].time === 500);
        assert(commands[1].type === "message");
        assert(commands[1].message.type === "image");
        assert(commands[1].message.text === "message3 - image");
        assert(commands[2].type === "wait");
        assert(commands[2].time === 500);
        assert(commands[3].message.type === "text");
        assert(commands[3].message.text === "message4");

        assert(commands[4].type === "wait");
        assert(commands[4].time === 500);
        assert(commands[5].message.type === "frame");
        console.log("commands[5].message.text", commands[5].message.text)
        assert(commands[5].message.text === undefined);

        assert(commands[6].type === "wait");
        assert(commands[6].time === 500);
        assert(commands[7].message.type === "image");
        assert(commands[7].message.text === undefined);
        assert(TiledeskChatbotUtil.isValidReply(message) === true);
    });

    it('Removes all empty text commands', async () => {
        const message = {
            "attributes": {
                "commands": [{
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "text",
                        "text": "", // EMPTY TEXT
                        "attributes": {
                            "attachment": {
                                "type": "template",
                                "buttons": [{
                                    "value": "Button1",
                                    "type": "text",
                                    "target": "blank",
                                    "link": "",
                                    "action": "",
                                    "show_echo": true
                                }]
                            }
                        }
                    }
                }, {
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "text" // NO TEXT
                    }
                }, {
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "text",
                        "text": ""
                    }
                }, {
                    "type": "wait",
                    "time": 500
                }, {
                    "type": "message",
                    "message": {
                        "type": "text",
                        "text": ""
                    }
                }]
            }
        }
        const cleanMessage = TiledeskChatbotUtil.removeEmptyReplyCommands(message);
        console.log("cleanMessage 2 reply:", JSON.stringify(cleanMessage));
        const commands = cleanMessage.attributes.commands;
        console.log("commands 2 reply:", JSON.stringify(commands));
        assert(commands.length === 0);
        assert(TiledeskChatbotUtil.isValidReply(message) === false);
    });
});




