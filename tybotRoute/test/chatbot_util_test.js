var assert = require('assert');
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil');

// describe('Intent name parsing', function() {
  
//     it('parsing ""', async () => {
//         const explicit_intent_name = "";
//         const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
//         // console.log("intent:", intent);
//         assert(intent === null);
//     });

//     it('parsing "{}"', async () => {
//         const explicit_intent_name = "{}";
//         const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
//         // console.log("intent:", intent);
//         assert(intent.name === "");
//         assert(intent.parameters !== null);
//     });

//     it('parsing "intent_name"', async () => {
//         const explicit_intent_name = "intent_name";
//         const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
//         // console.log("intent:", intent);
//         assert(intent !== null);
//         assert(intent.name === "intent_name");
//         assert(intent.parameters === undefined);
//     });

//     it('parsing "intent_name{}"', async () => {
//         const explicit_intent_name = "intent_name{}";
//         const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
//         // console.log("intent:", intent);
//         assert(intent !== null);
//         assert(intent.name === "intent_name");
//         assert(intent.parameters !== null);
//     });

//     it("parsing 'intent_name{valid JSON}'", async () => {
//         const explicit_intent_name = 'intent_name{ "name": "myname", "age": 20}';
//         const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
//         // console.log("intent:", intent);
//         assert(intent !== null);
//         assert(intent.name === "intent_name");
//         assert(intent.parameters !== null);
//         assert(intent.parameters.name === "myname");
//         assert(intent.parameters.age === 20);
//     });
    
    
// });

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
        console.log("random reply:", rnd_commands);
        assert(rnd_commands.length === 2);
        assert(rnd_commands[0].type === "wait");
        assert(rnd_commands[0].time === 500);
        assert(rnd_commands[1].type === "message");
        assert(rnd_commands[1].message.type === "text" || rnd_commands[1].message.type === "image");
        assert(rnd_commands[1].message.text === "message1" || rnd_commands[1].message.text === "message2" || rnd_commands[1].message.text === "message3 - image" || rnd_commands[1].message.text === "message4");
    });
});



