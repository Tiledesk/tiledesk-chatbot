# Tiledesk native chatbot

# 2.0.15
- added kb_chunks attribute in AskGptV2 action

# 2.0.12
- added flow logs
- added log action
- added dev webhook management

# 2.0.11
(missing)

# 2.0.10
- added: missing default contexts for gpt-4.1 models causing error with an user defined context

# 2.0.9-rc1
- removed: speech-to-text management

# 2.0.8

# 2.0.8-rc2
- added: check on preloaded_request_id in /block

# 2.0.8-rc1
- removed: TILEBOT_LOG var 

# 1.3.0
- added: AI_ENDPOINT env var
- added: ability to get 'none' as bodytype in webresponse

# 1.2.2
- bug-fixed: minor log fix

# 1.2.1
- bug-fixed: wrong key for web_response

# 1.2.0
- added: DirWebResposne
- added: management of webhook
- changed: refactoring of DIrWebRequestv2
- bug-fixed: erro while parsing webrequestv2 body

# 1.1.4
- bug-fixed: slit is undefined in TiledeskChatbotUtils

# 1.1.3
- bug-fixed: text is undefined in responseText while transcript message

# 1.1.2
- bug-fixed: minor improvement

# 1.0.27-rc1
- changed: context for gpt-40 and gpt-40-mini

# 1.0.26
- Restored old default context for AskKB Action
- Deleted message "Intent not found".

# 1.0.25
- bug-fixed: context for gpt-40 and gpt-40-mini

# 1.0.24
- changed: AiPrompt action to improves errors management

# 1.0.23

# 1.0.23-rc3
- changed: context for gpt-40 and gpt-40-mini

# 1.0.23-rc2
- bug-fixed: botid null or undefined while calling /ext/:boid

# 1.0.22
- bug-fixed: namespace is undefined and "engine" property if noIntent is not specified

# 1.0.21
- bug-fixed: namespace is undefined and "engine" property cannot be evaluated in DirAskGPTV2

# 1.0.20
- bug-fixed: message.attributes["flowAttributes"]

# 1.0.20-rc1
bug-fixed: message.attributes["flowAttributes"] added only if value size is <= 1kb

# 1.0.19
- bug-fixed: minor bug fixed

# 1.0.18
- added: TILEBOT_ENDPOINT env variable to startApp method

# 1.0.17
- removed userFlowAttributes from message.attributes (fix message too long issue)

# 1.0.16
 - removed: message.attributes["flowAttributes"] from reply

# 1.0.15
- changed: env var TILEBOT_ENDPOINT replaced with TILEBOT_ENDPOINT

# 1.0.14
- bug-fixed: action.isInfo added in DirMessage to fix test

# 1.0.13
 - bug-fixed: message.attributes.payload is not populated on first message
 - bug-fixed: message.attributes.payload was overwritten by message.request.attributes.payload
 
# 1.0.12
- changed: repo links

# 1.0.11
- bug-fixed: block hidden message for non-dev conversation

# 1.0.10
- added: replace-bot-v3 action

# 1.0.2
- bug-fixed: default engine for DirAskGPTV2
- bug-fixed: block only hidden message

# 1.0.1
- first deploy of Chatbot Plugs

### 0.1.1 updated MarckbotPlugs.js & DirectivesPlug.js
