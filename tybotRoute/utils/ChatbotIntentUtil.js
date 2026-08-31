const { Directives } = require('../tiledeskChatbotPlugs/directives/Directives.js');

/**
 * Intent parsing and intent/action -> directive conversion helpers.
 * Extracted from TiledeskChatbotUtil (Phase 6a). Behaviour unchanged.
 */

class ChatbotIntentUtil {


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

}

module.exports = { ChatbotIntentUtil };
