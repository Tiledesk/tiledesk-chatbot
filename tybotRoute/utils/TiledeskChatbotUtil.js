const { TiledeskExpression } = require('../TiledeskExpression');
const { Filler } = require('../tiledeskChatbotPlugs/Filler');
const { TiledeskChatbotConst } = require('../engine/TiledeskChatbotConst');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot.js');
let parser = require('accept-language-parser');
const { Directives } = require('../tiledeskChatbotPlugs/directives/Directives.js');
require('dotenv').config();
let axios = require('axios');
const winston = require('./winston');

const { CHANNEL_NAME } = require('./constants.js')

class TiledeskChatbotUtil {

    static parseIntent(explicit_intent_name) {
        let intent = {};
        if (explicit_intent_name === null) {
            return null; // invalid intent
        }
        if (explicit_intent_name.trim().length === 0) {
            return null; // invalid intent
        }
        let parts = explicit_intent_name.split("{");
        if (parts.length > 0 && parts[0].startsWith("{")) {
            return null; // invalid intent
        }
        else {
            intent.name = parts[0];
        }
        if (parts.length > 1) {
            let json_string = explicit_intent_name.substring(parts[0].length);
            try {
                json_string = json_string.replace(/'/g, '"');
                intent.parameters = JSON.parse(json_string);
                // if (intent.parameters) {
                    // for (const [key, value] of Object.entries(intent.parameters)) {
                    //   if (typeof value === "object") {
                    //     intent.parameters["_tdTypeOf:" + key] = "object";
                    //   }
                    //   else if (typeof value === "string") {
                    //     intent.parameters["_tdTypeOf:" + key] = "string";
                    //   }
                    //   else if (typeof value === "number") {
                    //     intent.parameters["_tdTypeOf:" + key] = "number";
                    //   }
                    //   else if (typeof value === "boolean") {
                    //     intent.parameters["_tdTypeOf:" + key] = "boolean";
                    //   }
                    // }
                //   }
                
            }
            catch (err) {
                winston.error("(TiledeskChatbotUtils) Error on parse json_string ", err)
            }
        }
        return intent;
    }

    static chooseRandomReply(message) {

        // {
		// 	"_tdActionTitle": null,
		// 	"_tdActionType": "randomreply",
		// 	"attributes": {
		// 		"disableInputMessage": false,
		// 		"commands": [{
		// 			"type": "wait",
		// 			"time": 500
		// 		}, {
		// 			"type": "message",
		// 			"message": {
		// 				"type": "text",
		// 				"text": "message1",
		// 				"attributes": {
		// 					"attachment": {
		// 						"type": "template",
		// 						"buttons": [{
		// 							"value": "Button1",
		// 							"type": "text",
		// 							"target": "blank",
		// 							"link": "",
		// 							"action": "",
		// 							"show_echo": true
		// 						}]
		// 					}
		// 				}
		// 			}
		// 		}, {
		// 			"type": "wait",
		// 			"time": 500
		// 		}, {
		// 			"type": "message",
		// 			"message": {
		// 				"type": "text",
		// 				"text": "message2"
		// 			}
		// 		}, {
		// 			"type": "wait",
		// 			"time": 500
		// 		}, {
		// 			"type": "message",
		// 			"message": {
		// 				"type": "image",
		// 				"text": "message3 - image",
		// 				"metadata": {
		// 					"src": ""
		// 				}
		// 			}
		// 		}, {
		// 			"type": "wait",
		// 			"time": 500
		// 		}, {
		// 			"type": "message",
		// 			"message": {
		// 				"type": "text",
		// 				"text": "message4",
		// 				"attributes": {
		// 					"attachment": {
		// 						"type": "template",
		// 						"buttons": [{
		// 							"value": "Button4",
		// 							"type": "text",
		// 							"target": "blank",
		// 							"link": "",
		// 							"action": "",
		// 							"show_echo": true
		// 						}]
		// 					}
		// 				}
		// 			}
		// 		}]
		// 	},
		// 	"text": "message1\r\nmessage2\r\nmessage3 - image\r\nmessage4\r\n"
		// }

        if (message && message.attributes && message.attributes.commands) {
            let commands = message.attributes.commands;
            if (commands.length %2 != 0) {
                winston.error("(TiledeskChatbotUtils) Error: commands.length cannot be an odd number")
                return null;
            }
            const MAX_VALUE = commands.length - 1;
            let random_even_index = Math.round((Math.random() * MAX_VALUE)); 
            if (random_even_index %2 == 0){//generated number is even
                random_even_index  = random_even_index + 1;
            }
            let new_commands = [];
            new_commands.push(commands[random_even_index - 1]); // pushed the wait
            new_commands.push(commands[random_even_index]); // pushed the message
            return new_commands;
        }
        else {
            return null;
        }

    }

    static filterOnVariables(message, variables) {
        if (!variables) {
          return;
        }
        if (message.attributes.commands.length > 0) {
            let commands = message.attributes.commands;
            message.text = "";
            for (let i = commands.length - 1; i >= 0; i--) {
                if (commands[i].type === "message") { // is a message, not wait
                    // if (commands[i].message["lang"] && !(commands[i].message["lang"] === lang)) { // if there is a filter and the filter is false, remove
                    const jsonCondition = commands[i].message["_tdJSONCondition"];
                    if (jsonCondition) {
                        const expression = TiledeskExpression.JSONGroupToExpression(jsonCondition);
                        const conditionResult = new TiledeskExpression().evaluateStaticExpression(expression, variables);
                        if (conditionResult === false) {
                            commands.splice(i, 1);
                            if (commands[i-1]) {
                                if (commands[i-1].type === "wait") {
                                    commands.splice(i-1, 1);
                                    i--;
                                }
                            }
                        }
                        else {
                            if (commands[i] && commands[i].message && commands[i].message.text) {
                                if (message.text === "") {
                                    message.text = commands[i].message.text;    
                                }
                                else {
                                    message.text = (commands[i].message.text + "\n\n" + message.text).trim();
                                }
                            }
                        }
                    }
                    else {
                        message.text = (commands[i].message.text + "\n\n" + message.text).trim();
                    }
                }
            }
        }
    }

    static removeEmptyReplyCommands(message) {
        try {
            if (message && message.attributes && message.attributes.commands && message.attributes.commands.length > 0) {
                let commands = message.attributes.commands;
                
                for (let i = commands.length - 1; i >= 0; i--) {
                    if (commands[i].type === "message") { // is a message, not a "wait"
                        if (commands[i].message) {
                            if (commands[i].message.type === "text") { // check text commands
                                if (( commands[i].message.text && commands[i].message.text.trim() === "") || !commands[i].message.text) {
                                    commands.splice(i, 1);
                                    if (commands[i-1]) {
                                        if (commands[i-1].type === "wait") {
                                            commands.splice(i-1, 1);
                                            i--;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        catch(error) {
            winston.error("(TiledeskChatbotUtils) Error while checking message ", error)
        }
        return message;
    }

    /*
    returns true if a valid message for a reply (i.e. at least one valid - non empty - message command)
    */
    static isValidReply(message) {
        if (message && message.attributes && message.attributes.commands && message.attributes.commands.length > 0) {
            return true;
        } else {
            return false;
        }
    }

    static totalMessageWait(message) {
        if (!message) {
          return;
        }
        if (message.attributes.commands.length > 0) {
            let commands = message.attributes.commands;
            let totalWaitTime = 0;
            for (let i = commands.length - 1; i >= 0; i--) {
                if (commands[i].type === "wait") { // is a wait
                    totalWaitTime += commands[i].time;
                }
            }
            return totalWaitTime;
        }
    }

    static fillCommandAttachments(command, variables) {
        winston.debug("(TiledeskChatbotUtils) Filling command button: ", command)
        if (command.message && command.message.attributes && command.message.attributes.attachment && command.message.attributes.attachment.buttons && command.message.attributes.attachment.buttons.length > 0) {
            let buttons = command.message.attributes.attachment.buttons;
            const filler = new Filler();
            buttons.forEach(button => {
                if (button.link) {
                    button.link = filler.fill(button.link, variables);
                    winston.debug("(TiledeskChatbotUtils) button.link filled: " + button.link)
                }
                if (button.value) {
                    button.value = filler.fill(button.value, variables);
                    winston.debug("(TiledeskChatbotUtils) button.value filled: " + button.value)
                }
            });
        }
        else {
            winston.debug("(TiledeskChatbotUtils) No attachments to fill in command")
        }
    }

    static allReplyButtons(message) {
        let all_buttons = [];
        if (message.attributes && message.attributes.commands) {
            let commands = message.attributes.commands;
            if (commands.length > 0) {
                for (let i = 0; i < commands.length; i++) {
                    let command = commands[i];
                    if (command.type === 'message' && command.message) {
                        if (command.message.attributes && command.message.attributes.attachment && command.message.attributes.attachment.buttons && command.message.attributes.attachment.buttons.length > 0) {
                            let buttons = command.message.attributes.attachment.buttons;
                            buttons.forEach(button => {
                                if (button.type === "action") {
                                    all_buttons.push(button);
                                }
                            });
                        }
                    }
                }
            }
        }
        return all_buttons;
    }

    static replaceJSONButtons(message, flow_attributes) {
        let all_buttons = [];
        if (message.attributes && message.attributes.commands) {
            let commands = message.attributes.commands;
            if (commands.length > 0) {
                for (let i = 0; i < commands.length; i++) {
                    let command = commands[i];
                    if (command.type === 'message' && command.message) {
                        if (command.message.attributes && command.message.attributes.attachment && command.message.attributes.attachment.json_buttons){
                            let json_buttons_string = command.message.attributes.attachment.json_buttons;
                            let final_buttons = this.renderJSONButtons(json_buttons_string, flow_attributes);
                            // let final_buttons = [];
                            // try {
                            //     // fill buttons
                            //     const filler = new Filler();
                            //     json_buttons_string = filler.fill(json_buttons_string, flow_attributes);
                            //     let json_buttons = JSON.parse(json_buttons_string);
                            //     if (Array.isArray(json_buttons)) {
                            //         json_buttons.forEach(button => {
                            //             if (button.value && button.type === "action" && button.action) {
                            //                 button.show_echo = true;
                            //                 final_buttons.push(button);
                            //             }
                            //             else if (button.value && button.type === "text") {
                            //                 button.show_echo = true;
                            //                 final_buttons.push(button);
                            //             }
                            //             else if (button.value && button.type === "url" && button.link) {
                            //                 button.show_echo = true;
                            //                 final_buttons.push(button);
                            //             }
                            //             else {
                            //                 winston.verbose("Invalid button. Skipping:", button);
                            //             }
                            //         });
                            //     }

                            //     // "buttons": [
                            //     //                 {
                            //     //                     "type": "action",
                            //     //                     "value": "Button1", // obbligatorio sempre
                            //     //                     "action": "#bb347206-d639-4926-94c9-e94930623dce", // mandatory
                            //     //                     "show_echo": true, // lo inserisco sempre
                            //     //                     "alias": "button1 alias"
                            //     //                 },
                            //     //                 {
                            //     //                     "type": "text",
                            //     //                     "value": "Button2 text", // obbligatorio sempre
                            //     //                     "show_echo": true // lo inserisco sempre
                            //     //                 },
                            //     //                 {
                            //     //                     "type": "url",
                            //     //                     "value": "Button3 link", // obbligatorio sempre
                            //     //                     "link": "http://", // obbligatorio
                            //     //                     "show_echo": true // lo inserisco sempre
                            //     //                 }
                            //     //             ]
                            // }
                            // catch(error) {
                            //     winston.warn("Invalid json_buttons:", error)
                            // }
                            if (final_buttons && final_buttons.length > 0) {
                                command.message.attributes.attachment.buttons = final_buttons;
                                delete command.message.attributes.attachment.json_buttons;
                            }
                            else {
                                winston.verbose("Invalid json_buttons. Skipping...")
                            }
                        }
                    }
                }
            }
        }
        return all_buttons;
    }

    static renderJSONButtons(json_buttons_string, flow_attributes) {
        let final_buttons = [];
        try {
            // fill buttons
            const filler = new Filler();
            json_buttons_string = filler.fill(json_buttons_string, flow_attributes);
            let json_buttons = JSON.parse(json_buttons_string);
            if (Array.isArray(json_buttons)) {
                json_buttons.forEach(button => {
                    if (button.value && button.type === "action" && button.action) {
                        button.show_echo = true;
                        final_buttons.push(button);
                    }
                    else if (button.value && button.type === "text") {
                        button.show_echo = true;
                        final_buttons.push(button);
                    }
                    else if (button.value && button.type === "url" && button.link) {
                        button.show_echo = true;
                        final_buttons.push(button);
                    }
                    else {
                        winston.verbose("Invalid button. Skipping:", button);
                    }
                });
            }

            // "buttons": [
            //                 {
            //                     "type": "action",
            //                     "value": "Button1", // obbligatorio sempre
            //                     "action": "#bb347206-d639-4926-94c9-e94930623dce", // mandatory
            //                     "show_echo": true, // lo inserisco sempre
            //                     "alias": "button1 alias"
            //                 },
            //                 {
            //                     "type": "text",
            //                     "value": "Button2 text", // obbligatorio sempre
            //                     "show_echo": true // lo inserisco sempre
            //                 },
            //                 {
            //                     "type": "url",
            //                     "value": "Button3 link", // obbligatorio sempre
            //                     "link": "http://", // obbligatorio
            //                     "show_echo": true // lo inserisco sempre
            //                 }
            //             ]
        }
        catch(error) {
            winston.warn("Invalid json_buttons:", error)
            return null;
        }
        return final_buttons;
    }

    static replaceJSONGalleries(message, flow_attributes) {
        if (message.attributes && message.attributes.commands) {
            let commands = message.attributes.commands;
            if (commands.length > 0) {
                for (let i = 0; i < commands.length; i++) {
                    let command = commands[i];
                    if (command.type === 'message' && command.message) {
                        if (command.message.attributes && command.message.attributes.attachment && command.message.attributes.attachment.json_gallery){
                            let final_gallery = [];
                            try {
                                // fill previews
                                const filler = new Filler();
                                let json_gallery_string = command.message.attributes.attachment.json_gallery;
                                json_gallery_string = filler.fill(json_gallery_string, flow_attributes);
                                let json_gallery = JSON.parse(json_gallery_string);
                                if (Array.isArray(json_gallery)) {
                                    json_gallery.forEach(el => {
                                        if (el.buttons) {
                                            el.buttons = TiledeskChatbotUtil.renderJSONButtons(JSON.stringify(el.buttons));
                                        }
                                        final_gallery.push(el);
                                    });
                                }
                                else {
                                    winston.verbose("Invalid json_gallery.");
                                }
                                //  "gallery": [
                                //     {
                                //         "preview": {
                                //             "src": "https://eu.rtmv3.tiledesk.com/api/images?path=uploads%2Fusers%2F63a05d755f117f0013541383%2Fimages%2F8913ff2c-d788-45e1-ac71-ee5bae8479e2%2Fhybrid-settings.png",
                                //              "uid": "mcamfa6s"
                                //         },
                                //         "title": "Title 1",
                                //         "description": "Description 1",
                                //         "buttons": [
                                //             {
                                //                 "uid": "0a956f4637584ee4862360c19a161f8f",
                                //                 "type": "url",
                                //                 "value": "Prod1",
                                //                 "link": "https://URL1",
                                //                 "target": "blank",
                                //                 "action": "",
                                //                 "attributes": "",
                                //                 "show_echo": true
                                //             },
                                //             {
                                //                 "uid": "4a87abe3d03a4b6fbdbc3fc33c4a8430",
                                //                 "type": "action",
                                //                 "value": "Prod1.1 (connector)",
                                //                 "link": "",
                                //                 "target": "blank",
                                //                 "action": "#0f7aaefd-3147-466b-82a4-06756f36eea5",
                                //                 "attributes": "",
                                //                 "show_echo": true
                                //             },
                                //             {
                                //                 "uid": "31fac2c82ce24da0a2e9850a32165fe8",
                                //                 "type": "text",
                                //                 "value": "Prod1.2 (text)",
                                //                 "link": "https://url2",
                                //                 "target": "blank",
                                //                 "action": "",
                                //                 "attributes": "",
                                //                 "show_echo": true
                                //             }
                                //         ]
                                //     },

                                // "buttons": [
                                //                 {
                                //                     "type": "action",
                                //                     "value": "Button1", // obbligatorio sempre
                                //                     "action": "#bb347206-d639-4926-94c9-e94930623dce", // mandatory
                                //                     "show_echo": true, // lo inserisco sempre
                                //                     "alias": "button1 alias"
                                //                 },
                                //                 {
                                //                     "type": "text",
                                //                     "value": "Button2 text", // obbligatorio sempre
                                //                     "show_echo": true // lo inserisco sempre
                                //                 },
                                //                 {
                                //                     "type": "url",
                                //                     "value": "Button3 link", // obbligatorio sempre
                                //                     "link": "http://", // obbligatorio
                                //                     "show_echo": true // lo inserisco sempre
                                //                 }
                                //             ]
                            }
                            catch(error) {
                                winston.warn("Error on JSON gallery parsing:", error);
                            }
                            if (final_gallery && final_gallery.length > 0) {
                                command.message.attributes.attachment.gallery = final_gallery;
                                delete command.message.attributes.attachment.json_gallery;
                            }
                            else {
                                winston.verbose("Invalid JSON Gallery.")
                            }
                        }
                    }
                }
            }
        }
        return message;
    }

    static buttonByText(text, buttons) {
        if (buttons === null || text === null) {
            return null;
        }
        let search_text = text.toLowerCase().trim();
        let selected_button = null;
        for (let i = 0; i < buttons.length; i++) {
            const button = buttons[i];
            if (button.value !== null && button.value.toLowerCase() === search_text) {
                selected_button = button;
                break;
            }
            else if (button.alias && button.alias.trim() !== "") { // search in button alias
                let alias = button.alias.split(",");
                if (alias.length > 0) {
                    for (let ii = 0; ii < alias.length; ii++) {
                        alias[ii] = alias[ii].toLowerCase().trim();
                    }
                    if (alias.indexOf(search_text) > -1) {
                        selected_button = button;
                        break;
                    }
                }
            }
        }
        return selected_button;
    }

    static stripEmoji(str) {
        if (str === null) {
            return str;
        }
        return str.replace(/\p{Emoji}/gu, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    static async updateConversationTranscript(chatbot, message) {
        if (!message || !message.senderFullname) { // not a conversation, can it be an Automation invocation?
            return null;
        }

        const chatbot_name = chatbot.bot.name.trim();
        if (message && message.text && message.text.trim() !== "" && message.sender !== "_tdinternal" && !this.isHiddenMessage(message)) {
            let transcript = await chatbot.getParameter("transcript");
            const _name_of = name_of(message, chatbot_name);
            if (transcript) {
                transcript = transcript + "\n" + _name_of + message.text;
            }
            else {
                transcript = _name_of + " " + message.text;
            }
            await chatbot.addParameter("transcript", transcript);
        }

        function name_of(message, chatbot_name) {
            if (!message.senderFullname) {
                return null;
            }
            let fullName = message.senderFullname;
            if (fullName.trim() === chatbot_name) {
                fullName = "bot:" + fullName;
            } else {
                fullName = "user:" + fullName;
            }
            return "<" + fullName + ">";
        }
    }

    static async clearConversationTranscript(chatbot, callback) {
        await chatbot.addParameter("transcript", "");
        if (callback) {
            callback();
        }
    }

    static transcriptJSON(transcript) {
        const regexp = /(<.*>)/gm;
        const parts = transcript.split(regexp);
        winston.debug("(TiledeskChatbotUtils) transcriptJSON parts: ", parts)

        let messages = [];
        let current_message;
        try {
            for (let i = 0; i < parts.length; i++) {
                let row = parts[i];
                if (row.startsWith("<bot:")) {
                    current_message = {
                        "role": "assistant"
                    }
                }
                else if (row.startsWith("<user:")) {
                    current_message = {
                        "role": "user"
                    }
                }
                else if (current_message) {
                    current_message["content"] = row.trim();
                    messages.push(current_message);
                }
            };
        }
        catch(error) {
            winston.error("(TiledeskChatbotUtils) transcriptJSON err: ", error);
        }
        return messages;
    }


    static isHiddenMessage(message) {
        if (message && message.attributes && message.attributes.subtype === "info") {
            return true;
        }
        return false;
    }

    static isAudioMessage(message){
        if (message && message.type && message.type === 'file' && message.metadata && message.metadata.src && message.metadata.type.includes('audio') ) {
            return true;
        }
        return false;
    }

    static lastUserMessageFrom(msg) {
        let message = {};
        message["senderFullname"] = msg["senderFullname"];      // ex. "Bot"
        message["type"] = msg["type"];                          // ex. "text",
        message["channel_type"] = msg["channel_type"];          // ex. "group",
        message["status"] = msg["status"];                      // ex. 0,
        message["id"] = msg["_id"];                             // ex. "6538cda46cb4d8002cf2317a",
        message["sender"] = msg["sender"];                      // ex. "system",
        message["recipient"] = msg["recipient"];                // ex. "support-group-65203e12f8c0cf002cf4110b-4066a69c8b464646a3ff25f9f41575bb",
        message["text"] = msg["text"];                          // ex. "\\start",
        message["createdBy"] = msg["createdBy"];                // ex. "system",
        message["attributes"] = msg["attributes"];              // ex. { "subtype": "info" }
        message["metadata"] = msg["metadata"];
        message["channel"] = msg["channel"];                    // ex. { "name": "chat21" }
        return message;
    }

    static async updateRequestAttributes(chatbot, chatbotToken, message, projectId, requestId) {
        // update request context
        try {
            winston.debug("Updating request variables. Message:", message);
            

            const addQueue = [];
            const deleteQueue = [];
            const add = (k, v) => { if (v !== undefined && v !== null && k !== undefined && k !== null) addQueue.push([k, v]); };
            const remove = (k) => { if(k) deleteQueue.push(k);}

            // --- BASE ATTRIBUTES ---
            if (process.env.BASE_URL) {
                add(TiledeskChatbotConst.REQ_CHAT_URL, `${process.env.BASE_URL}/dashboard/#/project/${projectId}/wsrequest/${requestId}/messages`);
            }
            
            add(TiledeskChatbotConst.REQ_PROJECT_ID_KEY, projectId);
            add(TiledeskChatbotConst.REQ_REQUEST_ID_KEY, requestId);

            // --- CHATBOT INFO ---
            if (chatbot.bot) {
                add(TiledeskChatbotConst.REQ_CHATBOT_NAME_KEY, chatbot.bot.name);
                add(TiledeskChatbotConst.REQ_CHATBOT_ID_KEY, chatbot.bot._id);
            }

            // --- TOKEN ---
            if (chatbotToken || process.env.TILEDESK_API) {
                add(TiledeskChatbotConst.REQ_CHATBOT_TOKEN, chatbotToken); // deprecated
                add(TiledeskChatbotConst.REQ_CHATBOT_TOKEN_v2, "JWT " + chatbotToken);
            }

            if (process.env.API_URL) {
                add(TiledeskChatbotConst.API_BASE_URL, process.env.API_URL);
            }

            // --- USER MESSAGE ---
            if (message.text && message.sender !== "_tdinternal") {
                remove(TiledeskChatbotConst.USER_INPUT); // REAL delete
    
                add(TiledeskChatbotConst.REQ_LAST_USER_TEXT_KEY, message.text);  // deprecated
                add(TiledeskChatbotConst.REQ_LAST_USER_TEXT_v2_KEY, message.text);
    
                add(TiledeskChatbotConst.REQ_LAST_USER_MESSAGE_TYPE_KEY, message.type);
                add(TiledeskChatbotConst.REQ_LAST_USER_MESSAGE_KEY,
                    TiledeskChatbotUtil.lastUserMessageFrom(message));
    
                if (message.channel) {
                    const channelName = message.channel.name === "chat21" ? "web" : message.channel.name;
                    add(TiledeskChatbotConst.REQ_CHAT_CHANNEL, channelName);
                }
            }

            // --- IMAGE ---
            if (message.type && message.type === "image" && message.metadata?.src) {
                add(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_URL, message.metadata.src);
                add(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_NAME, message.metadata.name);
                add(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_WIDTH, message.metadata.width);
                add(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_HEIGHT, message.metadata.height);
                add(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_TYPE, message.metadata.type);
            }

            // --- DOCUMENT ---
            if (message.type && message.type === "file" && message.metadata?.src) {


                if (message.metadata.src) {  
                    const m = message.metadata;
                    add(TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_URL, m.src); // deprecated
                    add(TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_AS_ATTACHMENT_URL, m.src);
        
                    const inlineUrl = m.src.replace("/download", "/");
                    add(TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_AS_INLINE_URL, inlineUrl);

                    add(TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_NAME, m.name);
                    add(TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_TYPE, m.type);
                }
            }
            
            // --- LEAD ---
            if (message && message.request && message.request.lead) {
                winston.debug("(TiledeskChatbotUtil) Lead found with email: " + message.request.lead.email + " and lead.fullname " + message.request.lead.fullname);
                const lead = message.request.lead;

                const savedEmail = await chatbot.getParameter(TiledeskChatbotConst.REQ_LEAD_EMAIL_KEY);
                if (lead.email && !savedEmail) add(TiledeskChatbotConst.REQ_LEAD_EMAIL_KEY, lead.email);

                const savedName = await chatbot.getParameter(TiledeskChatbotConst.REQ_LEAD_USERFULLNAME_KEY);
                if (lead.fullname && !savedName) add(TiledeskChatbotConst.REQ_LEAD_USERFULLNAME_KEY, lead.fullname);

                if (message.request.lead.phone) {
                    add(TiledeskChatbotConst.REQ_USER_PHONE_KEY, lead.phone);
                }
                if (lead.lead_id) {
                    const prefixes = ["wab-", "vxml-", CHANNEL_NAME.VOICE_TWILIO, CHANNEL_NAME.SMS];
                    if (prefixes.some(pref => lead.lead_id.startsWith(pref))) {
                        const parts = lead.lead_id.split("-");
                        if (parts[1]) add(TiledeskChatbotConst.REQ_CURRENT_PHONE_NUMBER_KEY, parts[1]);
                    }
                }
                if (message.request.lead._id) {
                    add(TiledeskChatbotConst.REQ_USER_LEAD_ID_KEY, lead._id);
                }
                if (message.request.lead.company) {
                    add(TiledeskChatbotConst.REQ_USER_COMPANY_KEY, lead.company);
                }
                if (message.request.ticket_id) {
                    add(TiledeskChatbotConst.REQ_TICKET_ID_KEY, message.request.ticket_id);
                }
            }
            
            // --- LAST MESSAGE ID ---
            const messageId = message._id;
            add(TiledeskChatbotConst.REQ_LAST_MESSAGE_ID_KEY, messageId);
            
            // --- LOCATION ---
            if (message.request && message.request.location && message.request.location.country) {
                add(TiledeskChatbotConst.REQ_COUNTRY_KEY, message.request.location.country);
            }
            if (message.request && message.request.location && message.request.location.city) {
                add(TiledeskChatbotConst.REQ_CITY_KEY, message.request.location.city);
            }

            // --- USER CONTEXT ---
            if (message.request) {
                let userLang = message.request.language;
                if (userLang) {
                    const parsed = parser.parse(userLang);
                    if (parsed?.[0]?.code) userLang = parsed[0].code;
                }

                add(TiledeskChatbotConst.REQ_USER_SOURCE_PAGE_KEY, message.request.sourcePage);
                add(TiledeskChatbotConst.REQ_USER_LANGUAGE_KEY, userLang);
                add(TiledeskChatbotConst.REQ_USER_AGENT_KEY, message.request.userAgent);

                if (message.request.attributes && message.request.attributes.decoded_jwt) {
                    add(TiledeskChatbotConst.REQ_DECODED_JWT_KEY, message.request.attributes.decoded_jwt);
                }
                
                const auth = !!message.request.requester?.isAuthenticated;
                add(TiledeskChatbotConst.REQ_REQUESTER_IS_AUTHENTICATED_KEY, auth);
            }

            // --- DEPARTMENT ---
            const dep = message.request?.department || message.attributes;
            if (dep) {
                add(TiledeskChatbotConst.REQ_DEPARTMENT_ID_KEY, dep.departmentId || dep._id);
                add(TiledeskChatbotConst.REQ_DEPARTMENT_NAME_KEY, dep.departmentName || dep.name);
            }

            // --- EMAIL ATTRIBUTES ---
            if (message.attributes) {
                const emailMapping = [
                    ["email_subject", TiledeskChatbotConst.REQ_EMAIL_SUBJECT],
                    ["email_toEmail", TiledeskChatbotConst.REQ_EMAIL_TO],
                    ["email_fromEmail", TiledeskChatbotConst.REQ_EMAIL_FROM],
                    ["email_messageId", TiledeskChatbotConst.REQ_EMAIL_MESSAGE_ID],
                    ["email_replyTo", TiledeskChatbotConst.REQ_EMAIL_REPLY_TO],
                    ["email_eml", TiledeskChatbotConst.REQ_EMAIL_EML],
                    ["link", TiledeskChatbotConst.REQ_EMAIL_ATTACHMENTS_LINK],
                    ["attachments", TiledeskChatbotConst.REQ_EMAIL_ATTACHMENTS_FILES]
                ];
    
                for (const [attr, key] of emailMapping) {
                    if (message.attributes[attr] !== undefined) {
                        add(key, message.attributes[attr]);
                    }
                }
            }

            // --- PAYLOAD ---
            if (message && message.request && message.request.attributes && message.request.attributes.payload) {
                if (!message.attributes) {
                    message.attributes = {}
                }
                message.attributes.payload = { ...message.attributes.payload, ...message.request.attributes.payload }
                winston.debug("(TiledeskChatbotUtil) Forced Set message.attributes.payload ", message.attributes.payload); 
            }
            if (message.attributes) {
                winston.debug("(TiledeskChatbotUtil) Ok message.attributes ", message.attributes);

                add(TiledeskChatbotConst.REQ_END_USER_ID_KEY, message.attributes.requester_id);
                add(TiledeskChatbotConst.REQ_END_USER_IP_ADDRESS_KEY, message.attributes.ipAddress);
                if (message.attributes.payload) {
                    try {
                        for (const [key, value] of Object.entries(message.attributes.payload)) {
                            const value_type = typeof value;
                            add(key, value);
                        }
                        add("payload", message.attributes.payload);
                    }
                    catch(err) {
                        winston.error("(TiledeskChatbotUtil) Error importing message payload in request variables: ", err);
                    }
                }

                // TODO - REMOVE - THEY ARE IN ATTRIBUTES.PAYLOAD
                // voice-vxml attributes
                if (message.attributes.dnis) {
                    add("dnis", message.attributes.dnis);
                }
                if (message.attributes.callId) {
                    add("callId", message.attributes.callId);
                }
                if (message.attributes.ani) {
                    add("ani", message.attributes.ani);
                }
            }

            
            
            // --- GLOBALS ---
            const _bot = chatbot.bot; // aka FaqKB
            winston.debug("(TiledeskChatbotUtil) Adding Globals to context: ", _bot); 
            
            if (_bot.attributes && _bot.attributes.globals) {
                winston.debug("(TiledeskChatbotUtil) Got Globals: ", _bot.attributes.globals);
                _bot.attributes.globals.forEach(async (global_var) => {
                    winston.debug("(TiledeskChatbotUtil) Adding global: " + global_var.key + " value: " + global_var.value);
                    add(global_var.key, global_var.value);
                });
            }
            // await chatbot.addParameter("testVar",
            //     {
            //         name: "Andrea",
            //         coords: {
            //             x: 2, y: 1
            //         }
            //     }
            // );

            
            // --- FINAL BATCH EXECUTION ---
            await Promise.all([
                ...addQueue.map(([key, value]) => chatbot.addParameter(key, value)),
                ...deleteQueue.map(key => chatbot.deleteParameter(key))
            ]);
            
        } catch(error) {
            winston.error("(TiledeskChatbotUtil) updateRequestAttributes Error: ", error);
            process.exit(1)
        }
    }

    static actionsToDirectives(actions) {
        let directives = [];
        if (actions && actions.length > 0) {
          actions.forEach(action => {
            let directive = Directives.actionToDirective(action);
            if (directive) {
              directives.push(directive);
            }
          });
        }
        return directives;
    }

    static addConnectAction(reply) {
        if (reply && reply.attributes && reply.attributes.nextBlockAction) {
            if (reply.actions) {
                reply.actions.push(reply.attributes.nextBlockAction);
            }
        }
    }

    static validateRequestId(requestId, projectId) {
        let isValid = false;
        if (requestId.startsWith("support-group-")) {
            const parts = requestId.split("-");
            if (parts.length >= 4) {
                isValid = (parts[0] === "support" && parts[1] === "group" && parts[2] === projectId && parts[3].length > 0);
            }
            else {
                isValid = false;
            }
        } else if (requestId.startsWith("automation-request-")) {
            const parts = requestId.split("-");
            if (parts.length === 4 || parts.length === 5) {
                isValid = (parts[0] === "automation" && parts[1] === "request" && parts[2] === projectId && parts[3].length > 0);
            }
            else {
                isValid = false;
            }
        }
        else {
            isValid = false;
        }
        return isValid;
    }

    static userFlowAttributes(flowAttributes) {
        const RESERVED = [
            TiledeskChatbotConst.REQ_CHATBOT_NAME_KEY,
            TiledeskChatbotConst.REQ_CHAT_URL,
            TiledeskChatbotConst.REQ_CITY_KEY,
            TiledeskChatbotConst.REQ_COUNTRY_KEY,
            TiledeskChatbotConst.REQ_DEPARTMENT_ID_KEY,
            TiledeskChatbotConst.REQ_DEPARTMENT_NAME_KEY,
            TiledeskChatbotConst.REQ_END_USER_ID_KEY,
            TiledeskChatbotConst.REQ_END_USER_IP_ADDRESS_KEY,
            TiledeskChatbotConst.REQ_LAST_MESSAGE_ID_KEY,
            TiledeskChatbotConst.REQ_LAST_USER_TEXT_KEY,
            TiledeskChatbotConst.REQ_PROJECT_ID_KEY,
            TiledeskChatbotConst.REQ_REQUEST_ID_KEY,
            TiledeskChatbotConst.REQ_USER_AGENT_KEY,
            TiledeskChatbotConst.REQ_USER_LANGUAGE_KEY,
            TiledeskChatbotConst.REQ_USER_SOURCE_PAGE_KEY,
            TiledeskChatbotConst.REQ_LAST_USER_MESSAGE_TYPE_KEY,
            TiledeskChatbotConst.REQ_TRANSCRIPT_KEY,
            TiledeskChatbotConst.REQ_LAST_USER_MESSAGE_KEY,
            TiledeskChatbotConst.REQ_DECODED_JWT_KEY,
            TiledeskChatbotConst.REQ_LAST_USER_IMAGE_URL,
            TiledeskChatbotConst.REQ_LAST_USER_IMAGE_NAME,
            TiledeskChatbotConst.REQ_LAST_USER_IMAGE_WIDTH,
            TiledeskChatbotConst.REQ_LAST_USER_IMAGE_HEIGHT,
            TiledeskChatbotConst.REQ_LAST_USER_IMAGE_TYPE,
            TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_URL,
            TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_NAME,
            TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_TYPE,
            TiledeskChatbotConst.REQ_TICKET_ID_KEY,
            TiledeskChatbotConst.REQ_CHAT_CHANNEL,
            TiledeskChatbotConst.REQ_USER_LEAD_ID_KEY,
            TiledeskChatbotConst.REQ_LAST_USER_TEXT_v2_KEY,
            TiledeskChatbotConst.REQ_REQUESTER_IS_AUTHENTICATED_KEY,
            TiledeskChatbotConst.USER_INPUT,
            TiledeskChatbotConst.REQ_CHATBOT_TOKEN,
            TiledeskChatbotConst.REQ_CHATBOT_TOKEN_v2,
          ]
          let userParams = {};
          if (flowAttributes) {
            for (const [key, value] of Object.entries(flowAttributes)) {
              // There is a bug that moves the requestId as a key in request attributes, so: && !key.startsWith("support-group-")
              if (!key.startsWith("_") && !RESERVED.some(e => e === key) && !key.startsWith("support-group-")) {
                userParams[key] = value;
              }
            }
          }
          return userParams;
    }

    static AiConditionPromptBuilder(prompt_header, intents, instructions) {
        let conditions = "";
        intents.forEach( function(intent) {
            conditions += `- label: ${intent.label} When: ${intent.prompt}\n`
        });

        instructions = instructions;
        let raw_condition_prompt = `${prompt_header}

${conditions}
${instructions}`
        return raw_condition_prompt;
    }

    /**
     * A stub to get the request parameters, hosted by tilebot on:
     * /${TILEBOT_ROUTE}/ext/parameters/requests/${requestId}?all
     *
     * @param {string} requestId. Tiledesk chatbot/requestId parameters
     */
    getChatbotParameters(requestId, callback) {
        const url = `${process.env.TILEBOT_ENDPOINT}/ext/reserved/parameters/requests/${requestId}?all`;
        const HTTPREQUEST = {
            url: url,
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'get'
        };
        this.myrequest(
            HTTPREQUEST,
            function (err, resbody) {
                if (err) {
                    if (callback) {
                        callback(err);
                    }
                }
                else {
                    if (callback) {
                        callback(null, resbody);
                    }
                }
            }, false
        );
    }

    myrequest(options, callback, log) {
        if (log) {
          winston.debug("(TiledeskChatbotUtil) myrequest API URL: " + options.url);
          winston.debug("(TiledeskChatbotUtil) myrequest Options URL: ", options);
        }
        axios(
          {
            url: options.url,
            method: options.method,
            data: options.json,
            params: options.params,
            headers: options.headers
          })
          .then((res) => {
            if (log) {
                winston.debug("(TiledeskChatbotUtil) Response for url: " + options.url);
                winston.debug("(TiledeskChatbotUtil) Response headers:\n", options);
            }
            if (res && res.status == 200 && res.data) {
              if (callback) {
                callback(null, res.data);
              }
            }
            else {
              if (callback) {
                callback(TiledeskClient.getErr({ message: "Response status not 200" }, options, res), null, null);
              }
            }
          })
          .catch((error) => {
            winston.error("(TiledeskChatbotUtil) Axios error: ", error.response.data);
            if (callback) {
              callback(error, null, null);
            }
          });
      }

    
      

}

module.exports = { TiledeskChatbotUtil };