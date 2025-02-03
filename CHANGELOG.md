# Tiledesk native chatbot

# 1.0.20
bug-fixed: message.attributes["flowAttributes"]

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
