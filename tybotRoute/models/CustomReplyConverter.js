const { Filler } = require("../tiledeskChatbotPlugs/Filler");

class CustomReplyConverter {

    static async convertCustomReply(custom_json, attributes) {
        console.log("custom_json:", custom_json)
        console.log("attributes:", attributes)
        /*
        {
            "message": {
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
            },
            "disableInputMessage": false,
            "noInputTimeout": 10000,
            "noInputIntent": "#88be42a8-9348-4315-a4a4-c5eaf54bd7a5",
            "noMatchIntent": "#293f5826-f66d-4e3b-aeb0-c3e7485e0c7e"
        }
    */
    
        let json_message = null;
        if (!custom_json) {
            console.log("!custom_json", custom_reply_action.custom_json)
            json_message = {type: 'text', text: 'malformed JSON in custom reply: custom_json is null'}
        }
        else {
            // fill attributes
            let filled_custom_json;
            const filler = new Filler();
            filled_custom_json = filler.fill(custom_json, attributes);
            console.log("try filled json parse:", filled_custom_json);
            try {
                json_message = JSON.parse(filled_custom_json)
            }
            catch(error) {
                json_message = {type: 'text', text: 'malformed JSON in custom reply: ' + filled_custom_json}
            }
        }
        // console.log("json_message", json_message)
        // building the replyv2 basic skeleton
        let reply = {
            "_tdActionType": "replyv2",
            "attributes": {
                "disableInputMessage": json_message.disableInputMessage ? true : false,
                "commands": [
                    {
                        "type": "wait",
                        "time": 0
                    },
                    {
                        "type": "message",
                        "message": {
                            "type": json_message.type,
                            "text": json_message.text,
                            // "attributes": {
                            //     "attachment": {
                            //         "type": "template",
                            //         "buttons": [
                            //             {
                            //                 "uid": "0aa72e2c90bc4f05b845baa1312b7318",
                            //                 "type": "action",
                            //                 "value": "go here",
                            //                 "link": "",
                            //                 "target": "blank",
                            //                 "action": "#688c3ab4-e29f-416f-b041-e498e701182e",
                            //                 "attributes": "",
                            //                 "show_echo": true,
                            //                 "alias": ""
                            //             }
                            //         ]
                            //     }
                            // }
                        }
                    }
                ]
            }
        }
    
        // metadata
        if (json_message.metadata) {
            reply.attributes.commands[1].message.metadata = json_message.metadata;
        }
        // no input, no match
        if (json_message.noInputTimeout) {
            reply.noInputTimeout = json_message.noInputTimeout;
        }
        if (json_message.noInputIntent) {
            reply.noInputIntent = json_message.noInputIntent;
        }
        if (json_message.noMatchIntent) {
            reply.noMatchIntent = json_message.noMatchIntent;
        }

        // buttons
        if (
            json_message.buttons &&
            json_message.buttons.length > 0
        ) {
            
            let buttons = [];
            json_message.buttons.forEach((button) => {
                console.log(button)
                buttons.push(button);
            });
            let attachment = {
                type: "template",
                buttons: buttons
            }
            reply.attributes.commands[1].message.attributes = {
                attachment: attachment
            }
        }
        console.log("rep", reply)
        return reply;
        // return {
        //     name: reply._tdActionType,
        //     action: reply
        // }
    }
}

module.exports = { CustomReplyConverter };