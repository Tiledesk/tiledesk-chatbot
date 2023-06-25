const { TiledeskExpression } = require('../TiledeskExpression');
const { Filler } = require('../tiledeskChatbotPlugs/Filler');

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
            for (let i = commands.length - 1; i >= 0; i--) {
                console.log("...commands[" + i + "]");
                message.text = "";
                if (commands[i].type === "message") { // is a message, not wait
                    console.log("commands[i]:", commands[i].message.text);
                    // console.log("commands[i]:", lang, (commands[i].message["lang"] === lang));
                    
                    // if (commands[i].message["lang"] && !(commands[i].message["lang"] === lang)) { // if there is a filter and the filter is false, remove
                    const jsonCondition = commands[i].message["_tdJSONCondition"];
                    // console.log("jsonCondition:", jsonCondition);
                    if (jsonCondition) {
                        // const expression = TiledeskExpression.JSONGroupsToExpression(jsonCondition.groups);
                        const expression = TiledeskExpression.JSONGroupToExpression(jsonCondition);
                        console.log("full json condition expression eval on command.message:", expression);
                        const conditionResult = new TiledeskExpression().evaluateStaticExpression(expression, variables);
                        console.log("conditionResult:", conditionResult);
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
                            if (commands[i] && commands[i].text) {
                                message.text += commands[i].text;
                                console.log("new text:", message.text)
                            }
                            else {
                                console.log("commands@", commands[i])
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
            });
        }
        else if (log) {
            console.log("No attachments to fill in command")
        }
    }

}

module.exports = { TiledeskChatbotUtil };