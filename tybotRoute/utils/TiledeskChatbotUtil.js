const { TiledeskExpression } = require('../TiledeskExpression');
const { Filler } = require('../tiledeskChatbotPlugs/Filler');
const { TiledeskChatbotConst } = require('../engine/TiledeskChatbotConst');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot.js');
let parser = require('accept-language-parser');
const { Directives } = require('../tiledeskChatbotPlugs/directives/Directives.js');
require('dotenv').config();
let axios = require('axios');
const winston = require('./winston');

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
                            // console.log("command with buttons ok:")
                            let json_buttons_string = command.message.attributes.attachment.json_buttons;
                            let json_buttons = null;
                            let final_buttons = [];
                            try {
                                // fill buttons
                                const filler = new Filler();
                                json_buttons_string = filler.fill(json_buttons_string, flow_attributes);
                                // console.log("json_buttons_string:", json_buttons_string);
                                json_buttons = JSON.parse(json_buttons_string);
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
                            }
                            catch(error) {
                                winston.warn("Invalid json_buttons:", error)
                            }
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
            const messageId = message._id;
            const chat_url = `https://panel.tiledesk.com/v3/dashboard/#/project/${projectId}/wsrequest/${requestId}/messages`

            await chatbot.addParameter(TiledeskChatbotConst.REQ_CHAT_URL, chat_url);
            await chatbot.addParameter(TiledeskChatbotConst.REQ_PROJECT_ID_KEY, projectId);
            await chatbot.addParameter(TiledeskChatbotConst.REQ_REQUEST_ID_KEY, requestId);
            
            if (chatbot.bot) {
                await chatbot.addParameter(TiledeskChatbotConst.REQ_CHATBOT_NAME_KEY, chatbot.bot.name);
                await chatbot.addParameter(TiledeskChatbotConst.REQ_CHATBOT_ID_KEY, chatbot.bot._id);
            }
            
            if (chatbotToken) {
                await chatbot.addParameter(TiledeskChatbotConst.REQ_CHATBOT_TOKEN, chatbotToken); // DEPRECATED
                await chatbot.addParameter(TiledeskChatbotConst.REQ_CHATBOT_TOKEN_v2, "JWT " + chatbotToken);
            }
            
            if (process.env.TILEDESK_API) {
                await chatbot.addParameter(TiledeskChatbotConst.REQ_CHATBOT_TOKEN, chatbotToken); // DEPRECATED
                await chatbot.addParameter(TiledeskChatbotConst.REQ_CHATBOT_TOKEN_v2, "JWT " + chatbotToken);
            }
            
            if (process.env.API_URL) {
                await chatbot.addParameter(TiledeskChatbotConst.API_BASE_URL, process.env.API_URL);
            }

            if (message.text && message.sender !== "_tdinternal") {
                await chatbot.deleteParameter(TiledeskChatbotConst.USER_INPUT); // user wrote, delete userInput, replyv2 will not trigger timeout action
                await chatbot.addParameter(TiledeskChatbotConst.REQ_LAST_USER_TEXT_KEY, message.text); // DEPRECATED
                await chatbot.addParameter(TiledeskChatbotConst.REQ_LAST_USER_TEXT_v2_KEY, message.text);
                if (message.channel) {
                    if (message.channel.name === "chat21") {
                        await chatbot.addParameter(TiledeskChatbotConst.REQ_CHAT_CHANNEL, "web"); // renames the channel in chat21
                    }
                    else {
                        await chatbot.addParameter(TiledeskChatbotConst.REQ_CHAT_CHANNEL, message.channel.name);
                    }
                }
                await chatbot.addParameter(TiledeskChatbotConst.REQ_LAST_USER_MESSAGE_TYPE_KEY, message.type);
                await chatbot.addParameter(TiledeskChatbotConst.REQ_LAST_USER_MESSAGE_KEY, TiledeskChatbotUtil.lastUserMessageFrom(message)); // JSON TYPE *NEW
            }

            // get image
            if (message.type && message.type === "image" && message.metadata) {
                if (message.metadata.src) {
                    await chatbot.addParameter(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_URL, message.metadata.src);
                    await chatbot.addParameter(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_NAME, message.metadata.name);
                    await chatbot.addParameter(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_WIDTH, message.metadata.width);
                    await chatbot.addParameter(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_HEIGHT, message.metadata.height);
                    await chatbot.addParameter(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_TYPE, message.metadata.type);
                }
            }

            // get document
            if (message.type && message.type === "file" && message.metadata) {
                if (message.metadata.src) {                    
                    await chatbot.addParameter("lastUserDocumentURL", message.metadata.src); // legacy. will be deprecated
                    const url_as_attachment = message.metadata.src;
                    await chatbot.addParameter("lastUserDocumentAsAttachmentURL", url_as_attachment);
                    let url_inline = url_as_attachment;
                    if (url_as_attachment.match(/.*\/download.*/)) { // removing "/download" removes the "Content-disposion: attachment" HTTP header
                        url_inline = url_as_attachment.replace('/download', '/');
                    }
                    await chatbot.addParameter("lastUserDocumentAsInlineURL", url_inline);
                    await chatbot.addParameter("lastUserDocumentName", message.metadata.name);
                    await chatbot.addParameter("lastUserDocumentType", message.metadata.type);
                }
            }
            
            if (message && message.request && message.request.lead) {
                winston.debug("(TiledeskChatbotUtil) Lead found with email: " + message.request.lead.email + " and lead.fullname " + message.request.lead.fullname);
                let currentLeadEmail = await chatbot.getParameter(TiledeskChatbotConst.REQ_LEAD_EMAIL_KEY);
                winston.debug("(TiledeskChatbotUtil) You lead email from attributes: " + currentLeadEmail);
                if (message.request.lead.email && !currentLeadEmail) {
                    // worth saving
                    winston.debug("(TiledeskChatbotUtil) worth saving email");
                    try {
                        await chatbot.addParameter(TiledeskChatbotConst.REQ_LEAD_EMAIL_KEY, message.request.lead.email);
                    }
                    catch(error) {
                        winston.error("(TiledeskChatbotUtil) Error on setting userEmail:", error);
                    }
                }
                let currentLeadName = await chatbot.getParameter(TiledeskChatbotConst.REQ_LEAD_USERFULLNAME_KEY);
                winston.debug("(TiledeskChatbotUtil) You lead email from attributes: " + currentLeadEmail);
                console.log("currentLeadName: ", currentLeadName)
                if (message.request.lead.fullname && !currentLeadName) {
                    // worth saving
                    console.log("inside if")
                    winston.debug("(TiledeskChatbotUtil) worth saving email");
                    try {
                        await chatbot.addParameter(TiledeskChatbotConst.REQ_LEAD_USERFULLNAME_KEY, message.request.lead.fullname);
                    }
                    catch(error) {
                        winston.error("(TiledeskChatbotUtil) Error on setting userFullname: ", error);
                    }
                }

                if (message.request.lead.phone) {
                    await chatbot.addParameter(TiledeskChatbotConst.REQ_USER_PHONE_KEY, message.request.lead.phone);
                }
                if (message.request.lead.lead_id && message.request.lead.lead_id.startsWith("wab-")) {
                    const splits = message.request.lead.lead_id.split("-");
                    if (splits && splits.length > 1) {
                        await chatbot.addParameter(TiledeskChatbotConst.REQ_CURRENT_PHONE_NUMBER_KEY,splits[1]);
                    }
                }
                if (message.request.lead._id) {
                    await chatbot.addParameter(TiledeskChatbotConst.REQ_USER_LEAD_ID_KEY, message.request.lead._id);
                }
                if (message.request.lead.company) {
                    await chatbot.addParameter(TiledeskChatbotConst.REQ_USER_COMPANY_KEY, message.request.lead.company);
                }
                if (message.request.ticket_id) {
                    await chatbot.addParameter(TiledeskChatbotConst.REQ_TICKET_ID_KEY, message.request.ticket_id);
                }
            }
            
            await chatbot.addParameter(TiledeskChatbotConst.REQ_LAST_MESSAGE_ID_KEY, messageId);
            if (message.request && message.request.location && message.request.location.country) {
                await chatbot.addParameter(TiledeskChatbotConst.REQ_COUNTRY_KEY, message.request.location.country);
            }
            if (message.request && message.request.location && message.request.location.city) {
                await chatbot.addParameter(TiledeskChatbotConst.REQ_CITY_KEY, message.request.location.city);
            }
            if (message.request) {
                let user_language = message.request["language"];
                if (message.request["language"]) {
                    var languages = parser.parse(message.request["language"]);
                    if (languages && languages.length > 0 && languages[0].code) {
                        user_language = languages[0].code;
                    }
                }
                await chatbot.addParameter(TiledeskChatbotConst.REQ_USER_SOURCE_PAGE_KEY, message.request.sourcePage);
                await chatbot.addParameter(TiledeskChatbotConst.REQ_USER_LANGUAGE_KEY, user_language);
                await chatbot.addParameter(TiledeskChatbotConst.REQ_USER_AGENT_KEY, message.request.userAgent);
                if (message.request.attributes && message.request.attributes.decoded_jwt) {
                    await chatbot.addParameter(TiledeskChatbotConst.REQ_DECODED_JWT_KEY, message.request.attributes.decoded_jwt);
                }
                if (message.request.requester) {
                    if (message.request.requester.isAuthenticated === true) {
                        await chatbot.addParameter(TiledeskChatbotConst.REQ_REQUESTER_IS_AUTHENTICATED_KEY, true);
                    }
                    else {
                        await chatbot.addParameter(TiledeskChatbotConst.REQ_REQUESTER_IS_AUTHENTICATED_KEY, false);
                    }
                }
            }
            if (message.request && message.request.department) {
                // It was an error when getting this from widget message's attributes
                // await chatbot.addParameter(TiledeskChatbotConst.REQ_DEPARTMENT_ID_KEY, message.attributes.departmentId);
                // await chatbot.addParameter(TiledeskChatbotConst.REQ_DEPARTMENT_NAME_KEY, message.attributes.departmentName);
                // get from request.department instead
                await chatbot.addParameter(TiledeskChatbotConst.REQ_DEPARTMENT_ID_KEY, message.request.department._id);
                await chatbot.addParameter(TiledeskChatbotConst.REQ_DEPARTMENT_NAME_KEY, message.request.department.name);
            }
            else if (message.attributes && message.attributes.departmentId) {
                await chatbot.addParameter(TiledeskChatbotConst.REQ_DEPARTMENT_ID_KEY, message.attributes.departmentId);
                await chatbot.addParameter(TiledeskChatbotConst.REQ_DEPARTMENT_NAME_KEY, message.attributes.departmentName);
            }

            if (message && message.request && message.request.attributes && message.request.attributes.payload) {
                if (!message.attributes) {
                    message.attributes = {}
                }
                message.attributes.payload = { ...message.attributes.payload, ...message.request.attributes.payload }
                winston.debug("(TiledeskChatbotUtil) Forced Set message.attributes.payload ", message.attributes.payload); 
            }
            if (message.attributes) {
                winston.debug("(TiledeskChatbotUtil) Ok message.attributes ", message.attributes);

                await chatbot.addParameter(TiledeskChatbotConst.REQ_END_USER_ID_KEY, message.attributes.requester_id);
                await chatbot.addParameter(TiledeskChatbotConst.REQ_END_USER_IP_ADDRESS_KEY, message.attributes.ipAddress);
                if (message.attributes.payload) {
                    try {
                        for (const [key, value] of Object.entries(message.attributes.payload)) {
                            const value_type = typeof value;
                            await chatbot.addParameter(key, value);
                        }
                        await chatbot.addParameter("payload", message.attributes.payload);
                    }
                    catch(err) {
                        winston.error("(TiledeskChatbotUtil) Error importing message payload in request variables: ", err);
                    }
                }

                // TODO - REMOVE - THEY ARE IN ATTRIBUTES.PAYLOAD
                // voice-vxml attributes
                if (message.attributes.dnis) {
                    await chatbot.addParameter("dnis", message.attributes.dnis);
                }
                if (message.attributes.callId) {
                    await chatbot.addParameter("callId", message.attributes.callId);
                }
                if (message.attributes.ani) {
                    await chatbot.addParameter("ani", message.attributes.ani);
                }
            }

            
            
            
            const _bot = chatbot.bot; // aka FaqKB
            winston.debug("(TiledeskChatbotUtil) Adding Globals to context: ", _bot); 
            
            if (_bot.attributes && _bot.attributes.globals) {
                winston.error("(TiledeskChatbotUtil) Got Globals: ", _bot.attributes.globals);
                _bot.attributes.globals.forEach(async (global_var) => {
                    winston.error("(TiledeskChatbotUtil) Adding global: " + global_var.key + " value: " + global_var.value);
                    await chatbot.addParameter(global_var.key, global_var.value);
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