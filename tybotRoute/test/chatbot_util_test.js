var assert = require('assert');
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil');
const { Filler } = require('../tiledeskChatbotPlugs/Filler');

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

// describe('Random reply', function() {
  
//     // it('One random reply', async () => {
//     //     const message = {
//     //         "attributes": {
//     //             "disableInputMessage": false,
//     //             "commands": [{
//     //                 "type": "wait",
//     //                 "time": 500
//     //             }, {
//     //                 "type": "message",
//     //                 "message": {
//     //                     "type": "text",
//     //                     "text": "message1",
//     //                     "attributes": {
//     //                         "attachment": {
//     //                             "type": "template",
//     //                             "buttons": [{
//     //                                 "value": "Button1",
//     //                                 "type": "text",
//     //                                 "target": "blank",
//     //                                 "link": "",
//     //                                 "action": "",
//     //                                 "show_echo": true
//     //                             }]
//     //                         }
//     //                     }
//     //                 }
//     //             }]
//     //         }
//     //     }
//     //     const rnd_commands = TiledeskChatbotUtil.chooseRandomReply(message);
//     //     console.log("random reply:", rnd_commands);
//     //     assert(rnd_commands.length === 2);
//     //     assert(rnd_commands[0].type === "wait");
//     //     assert(rnd_commands[0].time === 500);
//     //     assert(rnd_commands[1].type === "message");
//     //     assert(rnd_commands[1].message.type === "text");
//     //     assert(rnd_commands[1].message.text === "message1");
//     //     assert(rnd_commands[1].message.attributes !== null);
//     //     assert(rnd_commands[1].message.attributes.attachment.type === "template");
//     //     assert(rnd_commands[1].message.attributes.attachment.buttons !== null);
//     //     assert(rnd_commands[1].message.attributes.attachment.buttons[0].value === "Button1");
//     // });

//     it('Choose one random reply in a group of four', async () => {
//         const message = {
//             "attributes": {
//                 "commands": [{
//                     "type": "wait",
//                     "time": 500
//                 }, {
//                     "type": "message",
//                     "message": {
//                         "type": "text",
//                         "text": "message1",
//                         "attributes": {
//                             "attachment": {
//                                 "type": "template",
//                                 "buttons": [{
//                                     "value": "Button1",
//                                     "type": "text",
//                                     "target": "blank",
//                                     "link": "",
//                                     "action": "",
//                                     "show_echo": true
//                                 }]
//                             }
//                         }
//                     }
//                 }, {
//                     "type": "wait",
//                     "time": 500
//                 }, {
//                     "type": "message",
//                     "message": {
//                         "type": "text",
//                         "text": "message2"
//                     }
//                 }, {
//                     "type": "wait",
//                     "time": 500
//                 }, {
//                     "type": "message",
//                     "message": {
//                         "type": "image",
//                         "text": "message3 - image",
//                         "metadata": {
//                             "src": ""
//                         }
//                     }
//                 }, {
//                     "type": "wait",
//                     "time": 500
//                 }, {
//                     "type": "message",
//                     "message": {
//                         "type": "text",
//                         "text": "message4",
//                         "attributes": {
//                             "attachment": {
//                                 "type": "template",
//                                 "buttons": [{
//                                     "value": "Button4",
//                                     "type": "text",
//                                     "target": "blank",
//                                     "link": "",
//                                     "action": "",
//                                     "show_echo": true
//                                 }]
//                             }
//                         }
//                     }
//                 }]
//             }
//         }
//         const rnd_commands = TiledeskChatbotUtil.chooseRandomReply(message);
//         // console.log("random reply:", rnd_commands);
//         assert(rnd_commands.length === 2);
//         assert(rnd_commands[0].type === "wait");
//         assert(rnd_commands[0].time === 500);
//         assert(rnd_commands[1].type === "message");
//         assert(rnd_commands[1].message.type === "text" || rnd_commands[1].message.type === "image");
//         assert(rnd_commands[1].message.text === "message1" || rnd_commands[1].message.text === "message2" || rnd_commands[1].message.text === "message3 - image" || rnd_commands[1].message.text === "message4");
//     });
// });

// describe('commands.button filler', function() {
  
//     it('commands.button: one variable in a link', async () => {
//         const command = {
//             "type": "message",
//             "message": {
//                 "type": "text",
//                 "text": "I don't know!",
//                 "attributes": {
//                     "attachment": {
//                         "type": "template",
//                         "buttons": [{
//                             "value": "button text",
//                             "type": "url",
//                             "target": "blank",
//                             "link": "http://testurl.com/${project_id}/detail"
//                         }]
//                     }
//                 }
//             }
//         }
//         const vars = {
//             "project_id": "009988"
//         }
//         TiledeskChatbotUtil.fillCommandAttachments(command, vars);
//         // console.log("command:", JSON.stringify(command))
//         assert(command.message.attributes.attachment.buttons[0].value === "button text");
//         assert(command.message.attributes.attachment.buttons[0].type === "url");
//         assert(command.message.attributes.attachment.buttons[0].target === "blank");
//         assert(command.message.attributes.attachment.buttons[0].link === "http://testurl.com/009988/detail");
//     });
    
// });

describe('filler with liquidJS syntax {{}}', function() {
  
    it('string param', async () => {
        const vars = {
            "project_id": "009988"
        }
        const filler = new Filler();
        const text = filler.fill("project id is {{project_id}}", vars);
        // console.log("filled:", text)
        assert(text === "project id is 009988");
    });

    it('object params mixed with legacy parser ${}', async () => {
        const vars = {
            welcome: "Hello guys",
            collection: {
                products: [
                    {
                        title: "t1"
                    },
                    {
                        title: "t2"
                    }
                ]
            }
        }
        const template = "${welcome}! Your products: {% for product in collection.products %}title: {{ product.title }},{% endfor %}"
        const filler = new Filler();
        const text = filler.fill(template, vars);
        // console.log("text:<" + text + ">");
        assert(text === "Hello guys! Your products: title: t1,title: t2,");
    });

    it('object params getting object at index array', async () => {
        const vars = {
            collection: {
                products: [
                    {
                        title: "t1"
                    },
                    {
                        title: "t2"
                    }
                ]
            }
        }
        const template = "Your first item is {{collection.products[0].title}}"
        const filler = new Filler();
        const text = filler.fill(template, vars);
        assert(text === "Your first item is t1");
    });

    it('object params getting last object in array', async () => {
        const vars = {
            collection: {
                products: [
                    {
                        title: "t1"
                    },
                    {
                        title: "t2"
                    }
                ]
            }
        }
        const template = "Your first item is {{collection.products.last.title}}"
        const filler = new Filler();
        const text = filler.fill(template, vars);
        assert(text === "Your first item is t2");
    });
    
});



