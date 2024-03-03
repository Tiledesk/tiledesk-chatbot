const { TiledeskExpression } = require('../TiledeskExpression');
const { Filler } = require('../tiledeskChatbotPlugs/Filler');
const { TiledeskChatbotConst } = require('./TiledeskChatbotConst');
const { TiledeskChatbot } = require('./TiledeskChatbot.js');
let parser = require('accept-language-parser');
const { Directives } = require('../tiledeskChatbotPlugs/directives/Directives.js');

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
            // console.log("json_string (params)", json_string);
            try {
                intent.parameters = JSON.parse(json_string);
                // if (intent.parameters) {
                    // for (const [key, value] of Object.entries(intent.parameters)) {
                        // console.log("Checking type of:", key, value);
                    //   if (typeof value === "object") {
                    //     console.log("Checking type of is object:", key);
                    //     intent.parameters["_tdTypeOf:" + key] = "object";
                    //   }
                    //   else if (typeof value === "string") {
                    //     console.log("Checking type of is string:", key);
                    //     intent.parameters["_tdTypeOf:" + key] = "string";
                    //   }
                    //   else if (typeof value === "number") {
                    //     console.log("Checking type of is number:", key);
                    //     intent.parameters["_tdTypeOf:" + key] = "number";
                    //   }
                    //   else if (typeof value === "boolean") {
                    //     console.log("Checking type of is boolean:", key);
                    //     intent.parameters["_tdTypeOf:" + key] = "boolean";
                    //   }
                    // }
                //   }
                
            }
            catch (err) {
                console.log("error on intent.parameters = JSON.parse(json_string)", err);
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
                console.log("Error. commands.length cannot be an odd number");
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

    // static errorMessage(message) {
    //     return {
    //         name: "message",
    //         action: {
    //             "_tdThenStop": true,
    //             text: message,
    //             attributes: {
    //                 runtimeError: {
    //                     message: message
    //                 }
    //             }
    //         }
    //     }
    // }

    //static filterOnVariables(commands, variables) {
    static filterOnVariables(message, variables) {
        if (!variables) {
          return;
        }
        if (message.attributes.commands.length > 0) {
            let commands = message.attributes.commands;
            message.text = "";
            for (let i = commands.length - 1; i >= 0; i--) {
                // console.log("...commands[" + i + "]");
                if (commands[i].type === "message") { // is a message, not wait
                    // console.log("commands[i]:", commands[i].message.text);
                    // console.log("commands[i]:", lang, (commands[i].message["lang"] === lang));
                    
                    // if (commands[i].message["lang"] && !(commands[i].message["lang"] === lang)) { // if there is a filter and the filter is false, remove
                    const jsonCondition = commands[i].message["_tdJSONCondition"];
                    // console.log("jsonCondition:", jsonCondition);
                    if (jsonCondition) {
                        // const expression = TiledeskExpression.JSONGroupsToExpression(jsonCondition.groups);
                        const expression = TiledeskExpression.JSONGroupToExpression(jsonCondition);
                        // console.log("full json condition expression eval on command.message:", expression);
                        const conditionResult = new TiledeskExpression().evaluateStaticExpression(expression, variables);
                        // console.log("conditionResult:", conditionResult);
                        // FALSE
                        // console.log("commands[i]lang:", commands[i]);
                        if (conditionResult === false) {
                            // console.log("deleting command:", commands[i]);
                            commands.splice(i, 1);
                            if (commands[i-1]) {
                                // console.log("commands[i-1]?:", commands[i-1]);
                                if (commands[i-1].type === "wait") {
                                    commands.splice(i-1, 1);
                                    i--;
                                }
                            }
                        }
                        else {
                            // console.log("comands[i]:", commands[i], commands[i].message, commands[i].message.text)
                            if (commands[i] && commands[i].message && commands[i].message.text) {
                                // console.log("curr text:", message.text)
                                if (message.text === "") {
                                    message.text = commands[i].message.text;    
                                }
                                else {
                                    message.text = (commands[i].message.text + "\n\n" + message.text).trim();
                                }
                                // console.log("new text:", message.text)
                            }
                            else {
                                // console.log("commands@", commands[i])
                            }
                        }
                    }
                    else {
                        message.text = (commands[i].message.text + "\n\n" + message.text).trim();
                    }
                }
            }
          // for (let i = 0; i < commands.length; i++) {
          //   if (commands[i].type === 'message' && commands[i].message && commands[i].message.text) {
          //     if (this.log) {console.log("[" + commands[i].message.lang + "]commands[i].message.text:", commands[i].message.text);}
          //   }
          // }
        }
    }

    static removeEmptyReplyCommands(message) {
        try {
            if (message && message.attributes && message.attributes.commands && message.attributes.commands.length > 0) {
                let commands = message.attributes.commands;
                
                for (let i = commands.length - 1; i >= 0; i--) {
                    // console.log("...commands[" + i + "]");
                    if (commands[i].type === "message") { // is a message, not a "wait"
                        // console.log("commands[i]:", commands[i].message.text);
                        // let textEmpty = false;
                        if (commands[i].message) {
                            if (commands[i].message.type === "text") { // check text commands
                                if (( commands[i].message.text && commands[i].message.text.trim() === "") || !commands[i].message.text) {
                                    console.log("deleting command:", commands[i]);
                                    commands.splice(i, 1);
                                    if (commands[i-1]) {
                                        if (commands[i-1].type === "wait") {
                                            commands.splice(i-1, 1);
                                            i--;
                                            console.log("deleted wait");
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            // for (let i = 0; i < commands.length; i++) {
            //   if (commands[i].type === 'message' && commands[i].message && commands[i].message.text) {
            //     if (this.log) {console.log("[" + commands[i].message.lang + "]commands[i].message.text:", commands[i].message.text);}
            //   }
            // }
            }
        }
        catch(error) {
            log.error("error while checking", error)
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
        // console.log("compute delay...", message)
        if (message.attributes.commands.length > 0) {
            // console.log("going on delay")
            let commands = message.attributes.commands;
            // console.log("got commands", commands)
            let totalWaitTime = 0;
            for (let i = commands.length - 1; i >= 0; i--) {
                if (commands[i].type === "wait") { // is a wait
                    totalWaitTime += commands[i].time;
                }
            }
            return totalWaitTime;
        }
    }

    static fillCommandAttachments(command, variables, log) {
        if (log) {
            console.log("filling command button:", JSON.stringify(command))
        }
        if (command.message && command.message.attributes && command.message.attributes.attachment && command.message.attributes.attachment.buttons && command.message.attributes.attachment.buttons.length > 0){
            let buttons = command.message.attributes.attachment.buttons;
            const filler = new Filler();
            buttons.forEach(button => {
                if (button.link) {
                    button.link = filler.fill(button.link, variables);
                    if (log) {
                        console.log("button.link filled:", button.link)
                    }
                }
                if (button.value) {
                    button.value = filler.fill(button.value, variables);
                    if (log) {
                        console.log("button.value filled:", button.value)
                    }
                }
            });
        }
        else if (log) {
            console.log("No attachments to fill in command")
        }
    }

    static async updateConversationTranscript(chatbot, message) {
        // console.log("transcript updating with:", message)
        
        console.log("chatbot name is: ", chatbot.bot.name);
        
        if (message && message.text && message.text.trim() !== "" && message.sender !== "_tdinternal" && !this.isHiddenMessage(message)) {
            let transcript = await chatbot.getParameter("transcript");
            // console.log("transcript got:", transcript);
            if (transcript) {
                transcript = transcript + "\n[" + message.senderFullname + "] " + message.text;
                
            }
            else {
                transcript = "[" + message.senderFullname + "] " + message.text;
            }
            // console.log("transcript update:", transcript);
            await chatbot.addParameter("transcript", transcript);
            // let transcript2 = await chatbot.getParameter("transcript");
            // console.log("transcript updated:", transcript2);
        }
    }

    static isHiddenMessage(message) {
        if (message && message.attributes && message.attributes.subtype === "info") {
            return true;
        }
        return false;
    }

    static lastUserMessageFrom(msg) {
        let message = {};
        message["senderFullname"] = msg["senderFullname"]; // ex. "Bot"
        message["type"] = msg["type"]; // ex. "text",
        message["channel_type"] = msg["channel_type"]; // ex. "group",
        message["status"] = msg["status"]; // ex. 0,
        message["id"] = msg["_id"]; // ex. "6538cda46cb4d8002cf2317a",
        message["sender"] = msg["sender"]; // ex. "system",
        message["recipient"] = msg["recipient"]; // ex. "support-group-65203e12f8c0cf002cf4110b-4066a69c8b464646a3ff25f9f41575bb",
        message["text"] = msg["text"]; // ex. "\\start",
        message["createdBy"] = msg["createdBy"]; // ex. "system",
        message["attributes"] = msg["attributes"]; // ex. { "subtype": "info" }
        message["metadata"] = msg["metadata"];
        message["channel"] = msg["channel"]; // ex. { "name": "chat21" }
        return message;
    }

    static async updateRequestAttributes(chatbot, message, projectId, requestId) {
        // update request context
        try {
            if (chatbot.log) {console.log("Updating request variables. Message:", JSON.stringify(message));}
            const messageId = message._id;
            const chat_url = `https://panel.tiledesk.com/v3/dashboard/#/project/${projectId}/wsrequest/${requestId}/messages`
            // await chatbot.addParameter("chatbot", chatbot);
            await chatbot.addParameter(TiledeskChatbotConst.REQ_CHAT_URL, chat_url);
            // console.log("Adding proj_", projectId);
            await chatbot.addParameter(TiledeskChatbotConst.REQ_PROJECT_ID_KEY, projectId);
            // TODO add projectName too
            await chatbot.addParameter(TiledeskChatbotConst.REQ_REQUEST_ID_KEY, requestId);
            if (chatbot.bot) {
            await chatbot.addParameter(TiledeskChatbotConst.REQ_CHATBOT_NAME_KEY, chatbot.bot.name);
            }
            
            if (message.text && message.sender !== "_tdinternal") {
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
                // get image
                if (message.type && message.type === "image" && message.metadata) {
                    // "text": "\nimage text",
                    // "id_project": "65203e12f8c0cf002cf4110b",
                    // "createdBy": "8ac52a30-133f-4ee1-8b4b-96055bb81757",
                    // "metadata": {
                    //     "height": 905,
                    //     "name": "tiledesk_Open graph_general.png",
                    //     "src": "https://firebasestorage.googleapis.com/v0/b/chat21-pre-01.appspot.com/o/public%2Fimages%2F8ac52a30-133f-4ee1-8b4b-96055bb81757%2Fda5bbc8d-5174-49a8-a041-3d9355242da5%2Ftiledesk_Open%20graph_general.png?alt=media&token=be82fecb-3cd1-45b9-a135-c2c57a932862",
                    //     "type": "image/png",
                    //     "uid": "lo68iyq5",
                    //     "width": 1724
                    // }
                    if (message.metadata.src) {
                    await chatbot.addParameter("lastUserImageURL", message.metadata.src);
                    await chatbot.addParameter("lastUserImageName", message.metadata.name);
                    await chatbot.addParameter("lastUserImageWidth", message.metadata.width);
                    await chatbot.addParameter("lastUserImageHeight", message.metadata.height);
                    await chatbot.addParameter("lastUserImageType", message.metadata.type);
                    }
                }
                else {
                    await chatbot.addParameter("lastUserImageURL", null);
                    await chatbot.addParameter("lastUserImageName", null);
                    await chatbot.addParameter("lastUserImageWidth", null);
                    await chatbot.addParameter("lastUserImageHeight", null);
                    await chatbot.addParameter("lastUserImageType", null);
                }
                // get document
                if (message.type && message.type === "file" && message.metadata) {
                    // "type": "file",
                    // "text": "[LIBRETTO-WEB-ISTRUZIONI-GENITORI.pdf](https://firebasestorage.googleapis.com/v0/b/chat21-pre-01.appspot.com/o/public%2Fimages%2F8ac52a30-133f-4ee1-8b4b-96055bb81757%2F502265ee-4f4a-47a4-9375-172bb0e6bf39%2FLIBRETTO-WEB-ISTRUZIONI-GENITORI.pdf?alt=media&token=a09d065a-9b56-4507-8960-344cc294e4d1)\nistruzioni",
                    // "metadata": {
                    //     "name": "LIBRETTO-WEB-ISTRUZIONI-GENITORI.pdf",
                    //     "src": "https://firebasestorage.googleapis.com/v0/b/chat21-pre-01.appspot.com/o/public%2Fimages%2F8ac52a30-133f-4ee1-8b4b-96055bb81757%2F502265ee-4f4a-47a4-9375-172bb0e6bf39%2FLIBRETTO-WEB-ISTRUZIONI-GENITORI.pdf?alt=media&token=a09d065a-9b56-4507-8960-344cc294e4d1",
                    //     "type": "application/pdf",
                    //     "uid": "lo68oz8i"
                    // }
                    if (message.metadata.src) {
                    await chatbot.addParameter("lastUserDocumentURL", message.metadata.src);
                    await chatbot.addParameter("lastUserDocumentName", message.metadata.name);
                    await chatbot.addParameter("lastUserDocumentType", message.metadata.type);
                    }
                }
                else {
                    await chatbot.addParameter("lastUserDocumentURL", null);
                    await chatbot.addParameter("lastUserDocumentName", null);
                    await chatbot.addParameter("lastUserDocumentType", null);
                }
                if (message && message.request && message.request.lead) {
                    if (message.request.lead.email) {
                        await chatbot.addParameter("userEmail", message.request.lead.email);
                    }
                    if (message.request.lead.fullname && !message.request.lead.fullname.startsWith("guest#")) {
                        // worth saving
                        try {
                            // const current_userFullname = await chatbot.getParameter("userFullname");
                            // if (current_userFullname && current_userFullname.startsWith("guest#")) { // replace if exists as guest#
                            //     await chatbot.addParameter("userFullname", message.request.lead.fullname);
                            // }
                            // else if (!current_userFullname) {
                                await chatbot.addParameter("userFullname", message.request.lead.fullname);
                            // }
                        }
                        catch(error) {
                            console.error("Error on setting userFullname:", error);
                        }
                    }
                    else {
                        // console.log("!lead.fullname");
                    }
                    // console.log("Getting userPhone:", JSON.stringify(message.request));
                    if (message.request.lead.phone) {
                        await chatbot.addParameter("userPhone", message.request.lead.phone);
                    }
                    if (message.request.lead.lead_id && message.request.lead.lead_id.startsWith("wab-")) {
                        const splits = message.request.lead.lead_id.split("-");
                        if (splits && splits.length > 1) {
                            await chatbot.addParameter("currentPhoneNumber",splits[1]);
                        }
                    }
                    if (message.request.lead.lead_id) {
                        await chatbot.addParameter("userLeadId", message.request.lead.lead_id);
                    }
                    if (message.request.lead.company) {
                        await chatbot.addParameter("userCompany", message.request.lead.company);
                    }
                    if (message.request.ticket_id) {
                        await chatbot.addParameter("ticketId", message.request.ticket_id);
                    }
                }
            }
            
        
            await chatbot.addParameter(TiledeskChatbotConst.REQ_LAST_MESSAGE_ID_KEY, messageId);
            if (message.request && message.request.location && message.request.location.country) {
            await chatbot.addParameter(TiledeskChatbotConst.REQ_COUNTRY_KEY, message.request.location.country);
            }
            if (message.request && message.request.location && message.request.location.city) {
            await chatbot.addParameter(TiledeskChatbotConst.REQ_CITY_KEY, message.request.location.city);
            }
            // console.log("message.request.language", message.request["language"]);
            if (message.request) {
            let user_language = message.request["language"];
            if (message.request["language"]) {
                // console.log("HTTP language:", message.request["language"]);
                var languages = parser.parse(message.request["language"]);
                // console.log("languages:", languages);
                if (languages && languages.length > 0 && languages[0].code) {
                user_language = languages[0].code;
                }
            }
            await chatbot.addParameter(TiledeskChatbotConst.REQ_USER_SOURCE_PAGE_KEY, message.request.sourcePage);
            await chatbot.addParameter(TiledeskChatbotConst.REQ_USER_LANGUAGE_KEY, user_language);
            await chatbot.addParameter(TiledeskChatbotConst.REQ_USER_AGENT_KEY, message.request.userAgent);
            }
            // console.log("message.request.language", message.request["language"])
            if (message.request && message.request.department) {
            // It was an error when getting this from widget message's attributes
            // await chatbot.addParameter(TiledeskChatbotConst.REQ_DEPARTMENT_ID_KEY, message.attributes.departmentId);
            // await chatbot.addParameter(TiledeskChatbotConst.REQ_DEPARTMENT_NAME_KEY, message.attributes.departmentName);
            // get from request.department instead
            await chatbot.addParameter(TiledeskChatbotConst.REQ_DEPARTMENT_ID_KEY, message.request.department._id);
            await chatbot.addParameter(TiledeskChatbotConst.REQ_DEPARTMENT_NAME_KEY, message.request.department.name);
            }
        
            if (projectId === "641864da99c1fb00131ba495") {
            console.log("641864da99c1fb00131ba495 > for projectId:", JSON.stringify(message))
            }
            // for BUG
            // if (chatbot.log) {console.log("message.request.attributes.payload", JSON.stringify(message.request.attributes.payload))}
            if (message && message.request && message.request.attributes && message.request.attributes.payload) {
            if (!message.attributes) {
                message.attributes = {}
            }
            message.attributes.payload = message.request.attributes.payload
            if (chatbot.log) {console.log("FORCED SET message.attributes.payload:", JSON.stringify(message.attributes.payload))}
            // if (projectId === "641864da99c1fb00131ba495") {console.log("641864da99c1fb00131ba495 > FORCED SET message.attributes.payload:", JSON.stringify(message.attributes.payload))}
            }
        
            if (message.attributes) {
            if (chatbot.log) {console.log("Ok message.attributes", JSON.stringify(message.attributes));}
            if (projectId === "641864da99c1fb00131ba495") {console.log("641864da99c1fb00131ba495 > Ok message.attributes", JSON.stringify(message.attributes));}
            await chatbot.addParameter(TiledeskChatbotConst.REQ_END_USER_ID_KEY, message.attributes.requester_id);
            await chatbot.addParameter(TiledeskChatbotConst.REQ_END_USER_IP_ADDRESS_KEY, message.attributes.ipAddress);
            if (message.attributes.payload) {
                try {
                for (const [key, value] of Object.entries(message.attributes.payload)) {
                    // const value = all_parameters[key];
                    const value_type = typeof value;
                    //if (projectId === "641864da99c1fb00131ba495") {console.log("641864da99c1fb00131ba495 > importing payload parameter:", key, "value:", value, "type:", value_type);}
                    //await chatbot.addParameter(key, String(value));
                    await chatbot.addParameter(key, value);
                }
                }
                catch(err) {
                console.error("Error importing message payload in request variables:", err);
                }
            }
            }
            
            const _bot = chatbot.bot; // aka FaqKB
            if (chatbot.log) {
                console.log("Adding Globals to context..., chatbot.attributes?", JSON.stringify(_bot));
            }
            
            if (_bot.attributes && _bot.attributes.globals) {
                if (chatbot.log) {console.log("Got Globals:", JSON.stringify(_bot.attributes.globals));}
                _bot.attributes.globals.forEach(async (global_var) => {
                    if (chatbot.log) {console.log("Adding global:", global_var.key, "value:", global_var.value);}
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
            
            if (chatbot.log) {
                // console.log("tdcache:", chatbot.tdcache);
                console.log("requestId:", requestId);
                console.log("KEY:", TiledeskChatbotConst.REQ_PROJECT_ID_KEY);
                //   console.log("TiledeskChatbot:", TiledeskChatbot);
                let proj_ = await chatbot.getParameter(TiledeskChatbotConst.REQ_PROJECT_ID_KEY);
                console.log("request parameter proj_:", proj_);
                const all_parameters = await chatbot.allParameters();
                for (const [key, value] of Object.entries(all_parameters)) {
                    // const value = all_parameters[key];
                    const value_type = typeof value;
                    if (chatbot.log) {console.log("REQUEST ATTRIBUTE:", key, "VALUE:", value, "TYPE:", value_type)}
                }
            }
        } catch(error) {
            console.error("Error", error)
            process.exit(1)
        }
        // message["attributes"]: {
        //   "departmentId": "63c980054f857c00350535bc",
        //   "departmentName": "Default Department",
        //   "client": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
        //   "sourcePage": "https://tiledesk-html-site.tiledesk.repl.co/custom-attributes.html",
        //   "projectId": "63c980054f857c00350535b8",
        //   "payload": {
        //     "user_country": "Italy",
        //     "user_code": "E001"
        //   },
        //   "userFullname": "guest#7216 ",
        //   "requester_id": "7216926a-84c3-4bd5-aa79-8bd763094dc0",
        //   "ipAddress": "79.8.190.172",
        //   "sourceTitle": "Custom attributes",
        //   "widgetVer": "v.5.0.53-rc.4",
        //   "subtype": "info",
        //   "decoded_jwt": {
        //     "_id": "7216926a-84c3-4bd5-aa79-8bd763094dc0",
        //     "firstname": "guest#7216",
        //     "id": "7216926a-84c3-4bd5-aa79-8bd763094dc0",
        //     "fullName": "guest#7216 ",
        //     "iat": 1674201892,
        //     "aud": "https://tiledesk.com",
        //     "iss": "https://tiledesk.com",
        //     "sub": "guest",
        //     "jti": "f053af3d-14ca-411b-9903-78bd74e24218"
        //   }
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
        // console.log("reply foraddConnectAction:", reply);
        if (reply && reply.attributes && reply.attributes.nextBlockAction) {
            if (reply.actions) {
                reply.actions.push(reply.attributes.nextBlockAction);
                // console.log("actions are:", reply.actions)
            }
        }
    }

    static validateRequestId(requestId, projectId) {
        // console.log("checking requestId:", requestId, projectId)
        let isValid = false;
        if (requestId.startsWith("support-group-")) {
            const parts = requestId.split("-");
            // console.log("parts support request:", parts);
            if (parts.length === 4) {
                isValid = (parts[0] === "support" && parts[1] === "group" && parts[2] === projectId && parts[3].length > 0);
            }
            else {
                isValid = false;
            }
        } else if (requestId.startsWith("automation-request-")) {
            const parts = requestId.split("-");
            // console.log("parts automation request:", parts);
            if (parts.length === 4) {
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

}

module.exports = { TiledeskChatbotUtil };