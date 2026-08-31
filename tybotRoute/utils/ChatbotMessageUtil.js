/**
 * Message-level helpers: inspection of an incoming message and extraction of
 * the lightweight "last user message" projection stored in flow attributes.
 * Extracted from TiledeskChatbotUtil (Phase 6a). Behaviour unchanged.
 */

class ChatbotMessageUtil {


    static stripEmoji(str) {
        if (str === null) {
            return str;
        }
        return str.replace(/\p{Emoji}/gu, '')
            .replace(/\s+/g, ' ')
            .trim();
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

}

module.exports = { ChatbotMessageUtil };
