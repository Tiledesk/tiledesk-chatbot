const { TiledeskExpression } = require('../expressions/TiledeskExpression');
const { Filler } = require('../variables/Filler');
const winston = require('./winston');

/**
 * Reply "commands" manipulation: random replies, condition filtering, empty
 * command pruning, wait accounting, attachment filling and button lookup.
 * Extracted from TiledeskChatbotUtil (Phase 6a). Behaviour unchanged.
 */

class ChatbotReplyUtil {


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
        if (!message || !message.attributes || !message.attributes.commands) {
          // A reply whose action carried no attributes reaches here with
          // `commands` undefined. Dereferencing it threw inside the
          // sendSupportMessage callback, AFTER the message had been posted, so
          // the reply was delivered but the flow never resumed.
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


    static addConnectAction(reply) {
        if (reply && reply.attributes && reply.attributes.nextBlockAction) {
            if (reply.actions) {
                reply.actions.push(reply.attributes.nextBlockAction);
            }
        }
    }

}

module.exports = { ChatbotReplyUtil };
