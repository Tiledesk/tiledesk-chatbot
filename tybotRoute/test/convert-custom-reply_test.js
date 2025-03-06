var assert = require('assert');
const { CustomReplyConverter } = require('../models/CustomReplyConverter');

describe('Convert text reply', function() {
  
    it('text reply no buttons', async () => {
        const custom_reply = {
            "type": "text",
            "text": "Hi, how can I help you?",
        }
        const replyv2 = await CustomReplyConverter.convertCustomReply(JSON.stringify(custom_reply));
        console.log("replyv2:",replyv2); // JSON.stringify(replyv2, null, "  "));
        assert(replyv2._tdActionType === "replyv2");
        assert(replyv2.attributes !== null);
        assert(replyv2.attributes.commands);
        assert(replyv2.attributes.commands.length === 2);
        assert(replyv2.attributes.commands[1].type === "message");
        assert(replyv2.attributes.commands[1].message !== null);
        assert(replyv2.attributes.commands[1].message.type === "text");
        assert(replyv2.attributes.commands[1].message.text === "Hi, how can I help you?");
    });

    it('text reply with buttons', async () => {
        const custom_reply = {
            "type": "text",
            "text": "Hi, how can I help you?",
            "buttons": [
                {
                    "type": "action",
                    "value": "go here",
                    "target": "blank",
                    "action": "here block",
                    "show_echo": true
                }
            ]
        }
        const replyv2 = await CustomReplyConverter.convertCustomReply(JSON.stringify(custom_reply));
        console.log("replyv2:", JSON.stringify(replyv2, null, "  "));
        assert(replyv2._tdActionType === "replyv2");
        assert(replyv2.attributes !== null);
        assert(replyv2.attributes.commands);
        assert(replyv2.attributes.commands.length === 2);
        assert(replyv2.attributes.commands[1].type === "message");
        assert(replyv2.attributes.commands[1].message !== null);
        assert(replyv2.attributes.commands[1].message.type === "text");
        assert(replyv2.attributes.commands[1].message.text === "Hi, how can I help you?");
        assert(replyv2.attributes.commands[1].message.attributes?.attachment?.buttons?.length > 0);
        assert(replyv2.attributes.commands[1].message.attributes?.attachment?.buttons[0].type === "action");
        assert(replyv2.attributes.commands[1].message.attributes?.attachment?.buttons[0].value === "go here");
        assert(replyv2.attributes.commands[1].message.attributes?.attachment?.buttons[0].target === "blank");
        assert(replyv2.attributes.commands[1].message.attributes?.attachment?.buttons[0].action === "here block");
        assert(replyv2.attributes.commands[1].message.attributes?.attachment?.buttons[0].show_echo === true);
    });

    it('text reply with buttons noInput & noMatch', async () => {
        const custom_reply = {
            "type": "text",
            "text": "Hi, how can I help you?",
            "noInputTimeout": 10000,
            "noInputIntent": "no-input-block",
            "noMatchIntent": "no-match-block",
            "buttons": [
                {
                    "type": "action",
                    "value": "go here",
                    "target": "blank",
                    "action": "here block",
                    "show_echo": true
                }
            ]
        }
        const replyv2 = await CustomReplyConverter.convertCustomReply(JSON.stringify(custom_reply));
        console.log("replyv2:", JSON.stringify(replyv2, null, "  "));
        assert(replyv2._tdActionType === "replyv2");
        assert(replyv2.attributes !== null);
        assert(replyv2.attributes.commands);
        assert(replyv2.attributes.commands.length === 2);
        assert(replyv2.attributes.commands[1].type === "message");
        assert(replyv2.attributes.commands[1].message !== null);
        assert(replyv2.attributes.commands[1].message.type === "text");
        assert(replyv2.attributes.commands[1].message.text === "Hi, how can I help you?");
        assert(replyv2.attributes.commands[1].message.attributes?.attachment?.buttons?.length > 0);
        assert(replyv2.attributes.commands[1].message.attributes?.attachment?.buttons[0].type === "action");
        assert(replyv2.attributes.commands[1].message.attributes?.attachment?.buttons[0].value === "go here");
        assert(replyv2.attributes.commands[1].message.attributes?.attachment?.buttons[0].target === "blank");
        assert(replyv2.attributes.commands[1].message.attributes?.attachment?.buttons[0].action === "here block");
        assert(replyv2.attributes.commands[1].message.attributes?.attachment?.buttons[0].show_echo === true);
        assert(replyv2.noInputIntent === "no-input-block");
        assert(replyv2.noInputTimeout === 10000);
        assert(replyv2.noMatchIntent === "no-match-block");
    });

    it('image reply no buttons', async () => {
        const custom_reply = {
            "type": "image",
            "text": "Hi, how can I help you?",
            "metadata": {
                "name": "immagine.png",
                "src": "https://firebasestorage.googleapis.com/v0/b/chat21-pre-01.appspot.com/o/public%2Fimages%2F5e09d16d4d36110017506d7f%2F29461676-af4c-4046-a1e7-95e2ffa9dae9%2FUntitled%2013.png?alt=media&token=6b751e2a-60ee-4028-8819-2bd0f1c83552",
                "width": 1096,
                "height": 1096,
                "type": "image/png"
            }
        }
        const replyv2 = await CustomReplyConverter.convertCustomReply(JSON.stringify(custom_reply));
        console.log("replyv2:", JSON.stringify(replyv2, null, "  "));
        assert(replyv2._tdActionType === "replyv2");
        assert(replyv2.attributes !== null);
        assert(replyv2.attributes.commands);
        assert(replyv2.attributes.commands.length === 2);
        assert(replyv2.attributes.commands[1].type === "message");
        assert(replyv2.attributes.commands[1].message !== null);
        assert(replyv2.attributes.commands[1].message.type === "image");
        assert(replyv2.attributes.commands[1].message.text === "Hi, how can I help you?");
        assert(replyv2.attributes.commands[1].message.metadata !== null);
        assert(replyv2.attributes.commands[1].message.metadata.name === "immagine.png");
    });

    it('bad json', async () => {
        const replyv2 = await CustomReplyConverter.convertCustomReply("()");
        console.log("replyv2....:", JSON.stringify(replyv2, null, "  "));
        assert(replyv2._tdActionType === "replyv2");
        assert(replyv2.attributes !== null);
        assert(replyv2.attributes.commands);
        assert(replyv2.attributes.commands.length === 2);
        assert(replyv2.attributes.commands[1].type === "message");
        assert(replyv2.attributes.commands[1].message !== null);
        assert(replyv2.attributes.commands[1].message.type === "text");
        assert(replyv2.attributes.commands[1].message.text === "malformed JSON in custom reply: ()");
    });
    
});



