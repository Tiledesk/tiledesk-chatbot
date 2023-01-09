class TiledeskChatbotUtil {

    static intentComponents(explicit_intent_name) {
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
}

module.exports = { TiledeskChatbotUtil };