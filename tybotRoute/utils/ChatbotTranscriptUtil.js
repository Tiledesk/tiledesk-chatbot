const winston = require('./winston');
const { ChatbotMessageUtil } = require('./ChatbotMessageUtil.js');

/**
 * Conversation transcript accumulation / reset and its JSON (chat completion)
 * projection. Extracted from TiledeskChatbotUtil (Phase 6a). Behaviour unchanged.
 */

class ChatbotTranscriptUtil {

    
    static async updateConversationTranscript(chatbot, message) {
        if (!message || !message.senderFullname) { // not a conversation, can it be an Automation invocation?
            return null;
        }

        const chatbot_name = chatbot.bot.name.trim();
        if (message && message.text && message.text.trim() !== "" && message.sender !== "_tdinternal" && !ChatbotMessageUtil.isHiddenMessage(message)) {
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

}

module.exports = { ChatbotTranscriptUtil };
