require('dotenv').config();

const { ChatbotMessageUtil } = require('./ChatbotMessageUtil.js');
const { ChatbotIntentUtil } = require('./ChatbotIntentUtil.js');
const { ChatbotReplyUtil } = require('./ChatbotReplyUtil.js');
const { ChatbotJSONContentUtil } = require('./ChatbotJSONContentUtil.js');
const { ChatbotTranscriptUtil } = require('./ChatbotTranscriptUtil.js');
const { ChatbotRequestAttributesUtil } = require('./ChatbotRequestAttributesUtil.js');
const { ChatbotParametersClient } = require('./ChatbotParametersClient.js');

/**
 * Public facade over the chatbot utilities.
 *
 * The implementations live in focused modules (see the requires above); this
 * class only re-exports them so that every existing call site - including
 * `new TiledeskChatbotUtil().getChatbotParameters(...)` used by the test
 * suite - keeps working untouched.
 *
 * Instance methods (getChatbotParameters/myrequest) are inherited from
 * ChatbotParametersClient rather than delegated, so `this` binding inside
 * them is preserved exactly as before.
 */
class TiledeskChatbotUtil extends ChatbotParametersClient {

    // --- intents / directives (ChatbotIntentUtil) ---
    static parseIntent(explicit_intent_name) {
        return ChatbotIntentUtil.parseIntent(explicit_intent_name);
    }
    static actionsToDirectives(actions) {
        return ChatbotIntentUtil.actionsToDirectives(actions);
    }
    static AiConditionPromptBuilder(prompt_header, intents, instructions) {
        return ChatbotIntentUtil.AiConditionPromptBuilder(prompt_header, intents, instructions);
    }

    // --- reply commands (ChatbotReplyUtil) ---
    static chooseRandomReply(message) {
        return ChatbotReplyUtil.chooseRandomReply(message);
    }
    static filterOnVariables(message, variables) {
        return ChatbotReplyUtil.filterOnVariables(message, variables);
    }
    static removeEmptyReplyCommands(message) {
        return ChatbotReplyUtil.removeEmptyReplyCommands(message);
    }
    static isValidReply(message) {
        return ChatbotReplyUtil.isValidReply(message);
    }
    static totalMessageWait(message) {
        return ChatbotReplyUtil.totalMessageWait(message);
    }
    static fillCommandAttachments(command, variables) {
        return ChatbotReplyUtil.fillCommandAttachments(command, variables);
    }
    static allReplyButtons(message) {
        return ChatbotReplyUtil.allReplyButtons(message);
    }
    static buttonByText(text, buttons) {
        return ChatbotReplyUtil.buttonByText(text, buttons);
    }
    static addConnectAction(reply) {
        return ChatbotReplyUtil.addConnectAction(reply);
    }

    // --- dynamic JSON rich content (ChatbotJSONContentUtil) ---
    static replaceJSONButtons(message, flow_attributes) {
        return ChatbotJSONContentUtil.replaceJSONButtons(message, flow_attributes);
    }
    static renderJSONButtons(json_buttons_string, flow_attributes) {
        return ChatbotJSONContentUtil.renderJSONButtons(json_buttons_string, flow_attributes);
    }
    static replaceJSONGalleries(message, flow_attributes) {
        return ChatbotJSONContentUtil.replaceJSONGalleries(message, flow_attributes);
    }

    // --- message helpers (ChatbotMessageUtil) ---
    static stripEmoji(str) {
        return ChatbotMessageUtil.stripEmoji(str);
    }
    static isHiddenMessage(message) {
        return ChatbotMessageUtil.isHiddenMessage(message);
    }
    static isAudioMessage(message) {
        return ChatbotMessageUtil.isAudioMessage(message);
    }
    static lastUserMessageFrom(msg) {
        return ChatbotMessageUtil.lastUserMessageFrom(msg);
    }

    // --- transcript (ChatbotTranscriptUtil) ---
    static async updateConversationTranscript(chatbot, message) {
        return ChatbotTranscriptUtil.updateConversationTranscript(chatbot, message);
    }
    static async clearConversationTranscript(chatbot, callback) {
        return ChatbotTranscriptUtil.clearConversationTranscript(chatbot, callback);
    }
    static transcriptJSON(transcript) {
        return ChatbotTranscriptUtil.transcriptJSON(transcript);
    }

    // --- request attributes (ChatbotRequestAttributesUtil) ---
    static async updateRequestAttributes(chatbot, chatbotToken, message, projectId, requestId) {
        return ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, chatbotToken, message, projectId, requestId);
    }
    static validateRequestId(requestId, projectId) {
        return ChatbotRequestAttributesUtil.validateRequestId(requestId, projectId);
    }
    static userFlowAttributes(flowAttributes) {
        return ChatbotRequestAttributesUtil.userFlowAttributes(flowAttributes);
    }

}

module.exports = { TiledeskChatbotUtil };
