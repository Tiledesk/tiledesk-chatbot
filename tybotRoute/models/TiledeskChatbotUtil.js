const { TiledeskExpression } = require('../TiledeskExpression');

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

    static filterOnVariables(commands, variables) {
        if (!variables) {
          return;
        }
        if (commands.length > 0) {
          for (let i = commands.length - 1; i >= 0; i--) {
            console.log("...commands[" + i + "]");
            if (commands[i].type === "message") { // is a message, not wait
                // console.log("commands[i]:", commands[i].message.lang);
                // console.log("commands[i]:", lang, (commands[i].message["lang"] === lang));
                
                // if (commands[i].message["lang"] && !(commands[i].message["lang"] === lang)) { // if there is a filter and the filter is false, remove
                const jsonCondition = commands[i].message["_tdJSONCondition"];
                console.log("jsonCondition:", jsonCondition);
                if (jsonCondition) {
                    const expression = TiledeskExpression.JSONGroupsToExpression(jsonCondition.groups, variables);
                    console.log("full json condition expression eval on command.message:", expression);
                    const conditionResult = new TiledeskExpression().evaluateStaticExpression(expression);
                    console.log("conditionResult:", conditionResult);
                    // FALSE
                    // console.log("commands[i]lang:", commands[i]);
                    if (conditionResult === false) {
                        console.log("deleting command:", commands[i]);
                        commands.splice(i, 1);
                        if (commands[i-1]) {
                            // console.log("commands[i-1]?:", commands[i-1]);
                            if (commands[i-1].type === "wait") {
                                commands.splice(i-1, 1);
                                i--;
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

}

module.exports = { TiledeskChatbotUtil };