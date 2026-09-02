const { TiledeskChatbotConst } = require('../engine/TiledeskChatbotConst');
let parser = require('accept-language-parser');
const winston = require('./winston');
const { CHANNEL_NAME } = require('./constants.js');
const { ChatbotMessageUtil } = require('./ChatbotMessageUtil.js');

/**
 * Request-scoped flow attributes: population from the incoming message /
 * request, requestId validation and the user-visible attribute projection.
 * Extracted from TiledeskChatbotUtil (Phase 6a). Behaviour unchanged.
 */

class ChatbotRequestAttributesUtil {


    static async updateRequestAttributes(chatbot, chatbotToken, message, projectId, requestId) {
        // update request context
        try {
            winston.debug("Updating request variables. Message:", message);
            

            const addQueue = [];
            const deleteQueue = [];
            const add = (k, v) => { if (v !== undefined && v !== null && k !== undefined && k !== null) addQueue.push([k, v]); };
            const remove = (k) => { if(k) deleteQueue.push(k);}

            // --- BASE ATTRIBUTES ---
            if (process.env.BASE_URL) {
                add(TiledeskChatbotConst.REQ_CHAT_URL, `${process.env.BASE_URL}/dashboard/#/project/${projectId}/wsrequest/${requestId}/messages`);
            }
            
            add(TiledeskChatbotConst.REQ_PROJECT_ID_KEY, projectId);
            add(TiledeskChatbotConst.REQ_REQUEST_ID_KEY, requestId);

            // --- CHATBOT INFO ---
            if (chatbot.bot) {
                add(TiledeskChatbotConst.REQ_CHATBOT_NAME_KEY, chatbot.bot.name);
                add(TiledeskChatbotConst.REQ_CHATBOT_ID_KEY, chatbot.bot._id);
            }

            // --- TOKEN ---
            if (chatbotToken || process.env.TILEDESK_API) {
                add(TiledeskChatbotConst.REQ_CHATBOT_TOKEN, chatbotToken); // deprecated
                add(TiledeskChatbotConst.REQ_CHATBOT_TOKEN_v2, "JWT " + chatbotToken);
            }

            if (process.env.API_URL) {
                add(TiledeskChatbotConst.API_BASE_URL, process.env.API_URL);
            }

            // --- USER MESSAGE ---
            if (message.text && message.sender !== "_tdinternal") {
                remove(TiledeskChatbotConst.USER_INPUT); // REAL delete
    
                add(TiledeskChatbotConst.REQ_LAST_USER_TEXT_KEY, message.text);  // deprecated
                add(TiledeskChatbotConst.REQ_LAST_USER_TEXT_v2_KEY, message.text);
    
                add(TiledeskChatbotConst.REQ_LAST_USER_MESSAGE_TYPE_KEY, message.type);
                add(TiledeskChatbotConst.REQ_LAST_USER_MESSAGE_KEY,
                    ChatbotMessageUtil.lastUserMessageFrom(message));
    
                if (message.channel) {
                    const channelName = message.channel.name === "chat21" ? "web" : message.channel.name;
                    add(TiledeskChatbotConst.REQ_CHAT_CHANNEL, channelName);
                }
            }

            // --- IMAGE ---
            if (message.type && message.type === "image" && message.metadata?.src) {
                add(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_URL, message.metadata.src);
                add(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_NAME, message.metadata.name);
                add(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_WIDTH, message.metadata.width);
                add(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_HEIGHT, message.metadata.height);
                add(TiledeskChatbotConst.REQ_LAST_USER_IMAGE_TYPE, message.metadata.type);
            }

            // --- DOCUMENT ---
            if (message.type && message.type === "file" && message.metadata?.src) {


                if (message.metadata.src) {  
                    const m = message.metadata;
                    add(TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_URL, m.src); // deprecated
                    add(TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_AS_ATTACHMENT_URL, m.src);
        
                    const inlineUrl = m.src.replace("/download", "/");
                    add(TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_AS_INLINE_URL, inlineUrl);

                    add(TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_NAME, m.name);
                    add(TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_TYPE, m.type);
                }
            }
            
            // --- LEAD ---
            if (message && message.request && message.request.lead) {
                winston.debug("(TiledeskChatbotUtil) Lead found with email: " + message.request.lead.email + " and lead.fullname " + message.request.lead.fullname);
                const lead = message.request.lead;

                const savedEmail = await chatbot.getParameter(TiledeskChatbotConst.REQ_LEAD_EMAIL_KEY);
                if (lead.email && !savedEmail) add(TiledeskChatbotConst.REQ_LEAD_EMAIL_KEY, lead.email);

                const savedName = await chatbot.getParameter(TiledeskChatbotConst.REQ_LEAD_USERFULLNAME_KEY);
                if (lead.fullname && !savedName) add(TiledeskChatbotConst.REQ_LEAD_USERFULLNAME_KEY, lead.fullname);

                if (message.request.lead.phone) {
                    add(TiledeskChatbotConst.REQ_USER_PHONE_KEY, lead.phone);
                }
                if (lead.lead_id) {
                    const prefixes = ["wab-", "vxml-", CHANNEL_NAME.VOICE_TWILIO, CHANNEL_NAME.SMS];
                    if (prefixes.some(pref => lead.lead_id.startsWith(pref))) {
                        const parts = lead.lead_id.split("-");
                        if (parts[1]) add(TiledeskChatbotConst.REQ_CURRENT_PHONE_NUMBER_KEY, parts[1]);
                    }
                }
                if (message.request.lead._id) {
                    add(TiledeskChatbotConst.REQ_USER_LEAD_ID_KEY, lead._id);
                }
                if (message.request.lead.company) {
                    add(TiledeskChatbotConst.REQ_USER_COMPANY_KEY, lead.company);
                }
                if (message.request.ticket_id) {
                    add(TiledeskChatbotConst.REQ_TICKET_ID_KEY, message.request.ticket_id);
                }
            }
            
            // --- LAST MESSAGE ID ---
            const messageId = message._id;
            add(TiledeskChatbotConst.REQ_LAST_MESSAGE_ID_KEY, messageId);
            
            // --- LOCATION ---
            if (message.request && message.request.location && message.request.location.country) {
                add(TiledeskChatbotConst.REQ_COUNTRY_KEY, message.request.location.country);
            }
            if (message.request && message.request.location && message.request.location.city) {
                add(TiledeskChatbotConst.REQ_CITY_KEY, message.request.location.city);
            }

            // --- USER CONTEXT ---
            if (message.request) {
                let userLang = message.request.language;
                if (userLang) {
                    const parsed = parser.parse(userLang);
                    if (parsed?.[0]?.code) userLang = parsed[0].code;
                }

                add(TiledeskChatbotConst.REQ_USER_SOURCE_PAGE_KEY, message.request.sourcePage);
                add(TiledeskChatbotConst.REQ_USER_LANGUAGE_KEY, userLang);
                add(TiledeskChatbotConst.REQ_USER_AGENT_KEY, message.request.userAgent);

                if (message.request.attributes && message.request.attributes.decoded_jwt) {
                    add(TiledeskChatbotConst.REQ_DECODED_JWT_KEY, message.request.attributes.decoded_jwt);
                }
                
                const auth = !!message.request.requester?.isAuthenticated;
                add(TiledeskChatbotConst.REQ_REQUESTER_IS_AUTHENTICATED_KEY, auth);
            }

            // --- DEPARTMENT ---
            const dep = message.request?.department || message.attributes;
            if (dep) {
                add(TiledeskChatbotConst.REQ_DEPARTMENT_ID_KEY, dep.departmentId || dep._id);
                add(TiledeskChatbotConst.REQ_DEPARTMENT_NAME_KEY, dep.departmentName || dep.name);
            }

            // --- EMAIL ATTRIBUTES ---
            if (message.attributes) {
                const emailMapping = [
                    ["email_subject", TiledeskChatbotConst.REQ_EMAIL_SUBJECT],
                    ["email_toEmail", TiledeskChatbotConst.REQ_EMAIL_TO],
                    ["email_fromEmail", TiledeskChatbotConst.REQ_EMAIL_FROM],
                    ["email_messageId", TiledeskChatbotConst.REQ_EMAIL_MESSAGE_ID],
                    ["email_replyTo", TiledeskChatbotConst.REQ_EMAIL_REPLY_TO],
                    ["email_eml", TiledeskChatbotConst.REQ_EMAIL_EML],
                    ["link", TiledeskChatbotConst.REQ_EMAIL_ATTACHMENTS_LINK],
                    ["attachments", TiledeskChatbotConst.REQ_EMAIL_ATTACHMENTS_FILES]
                ];
    
                for (const [attr, key] of emailMapping) {
                    if (message.attributes[attr] !== undefined) {
                        add(key, message.attributes[attr]);
                    }
                }
            }

            // --- PAYLOAD ---
            if (message && message.request && message.request.attributes && message.request.attributes.payload) {
                if (!message.attributes) {
                    message.attributes = {}
                }
                message.attributes.payload = { ...message.attributes.payload, ...message.request.attributes.payload }
                winston.debug("(TiledeskChatbotUtil) Forced Set message.attributes.payload ", message.attributes.payload); 
            }
            if (message.attributes) {
                winston.debug("(TiledeskChatbotUtil) Ok message.attributes ", message.attributes);

                add(TiledeskChatbotConst.REQ_END_USER_ID_KEY, message.attributes.requester_id);
                add(TiledeskChatbotConst.REQ_END_USER_IP_ADDRESS_KEY, message.attributes.ipAddress);
                if (message.attributes.payload) {
                    try {
                        for (const [key, value] of Object.entries(message.attributes.payload)) {
                            const value_type = typeof value;
                            add(key, value);
                        }
                        add("payload", message.attributes.payload);
                    }
                    catch(err) {
                        winston.error("(TiledeskChatbotUtil) Error importing message payload in request variables: ", err);
                    }
                }

                // TODO - REMOVE - THEY ARE IN ATTRIBUTES.PAYLOAD
                // voice-vxml attributes
                if (message.attributes.dnis) {
                    add("dnis", message.attributes.dnis);
                }
                if (message.attributes.callId) {
                    add("callId", message.attributes.callId);
                }
                if (message.attributes.ani) {
                    add("ani", message.attributes.ani);
                }
            }

            
            
            // --- GLOBALS ---
            const _bot = chatbot.bot; // aka FaqKB
            winston.debug("(TiledeskChatbotUtil) Adding Globals to context: ", _bot); 
            
            if (_bot.attributes && _bot.attributes.globals) {
                winston.debug("(TiledeskChatbotUtil) Got Globals: ", _bot.attributes.globals);
                _bot.attributes.globals.forEach(async (global_var) => {
                    winston.debug("(TiledeskChatbotUtil) Adding global: " + global_var.key + " value: " + global_var.value);
                    add(global_var.key, global_var.value);
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

            
            // --- FINAL BATCH EXECUTION ---
            await Promise.all([
                ...addQueue.map(([key, value]) => chatbot.addParameter(key, value)),
                ...deleteQueue.map(key => chatbot.deleteParameter(key))
            ]);
            
        } catch(error) {
            winston.error("(TiledeskChatbotUtil) updateRequestAttributes Error: ", error);
            // Rethrow, never process.exit(1): ONE failed Redis write (a
            // reconnect, a timeout, a full instance) used to kill the whole
            // chatbot process and every conversation in flight with it, and the
            // caller's own try/catch -- which exists precisely to abort just
            // this message -- was never reached. A library helper must not
            // terminate its host.
            throw error;
        }
    }


    static validateRequestId(requestId, projectId) {
        let isValid = false;
        // An absent (or non-string) id is not a valid one. Going straight to
        // `.startsWith` threw "Cannot read properties of undefined (reading
        // 'startsWith')" for a message payload with no request_id, out of the
        // async route handler that calls this: the caller was never answered
        // and the worker died. Answering the question asked is the fix.
        if (typeof requestId !== 'string') {
            return false;
        }
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

}

module.exports = { ChatbotRequestAttributesUtil };
