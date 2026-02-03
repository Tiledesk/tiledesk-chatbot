# Tiledesk native chatbot

# 2.0.43
- Added Iteration action

# 2.0.42
- Updated AskGPTV2 with embeddings support

# 2.0.41
- Updated DirReply in order to fill actions metadata

# 2.0.38
- Improved AskGPTV2 action to support skip_unanswered option and use reranking only with hybrid namespaces

# 2.0.34
- Improved AskGPTV2 action with support for multi LLMs

# 2.0.33
- Added default context for general LLMs in AskKBV2

# 2.0.32
- Improved AiPrompt to support MCP Servers

# 2.0.31
- Added AiCondition action
- Improved AiPrompt action to support openai models
- Added contexts for gpt-5 in AskKB action
- Added new attributes parameter for email
- Fixed bug: action-model not filled in dirAiPrompt

# 2.0.27
- bug-fixed: not all chatbot variable are updated with leadUpdate action

# 2.0.26
- added: check and skip private message from internal-notes

# 2.0.25
- updated: AskGPTV2 action to add unanswered questions

# 2.0.23
- update: setDefaultEngine method on DirAskGPTV2
- added: json gallery

# 2.0.22
- hotfix: wrong pinecone index name

# 2.0.21
- added: support for standard/hybrid search and indexing

# 2.0.20
- minor fixes to webhook endpoint

# 2.0.19
- updated: multi-worker to 0.3.2
- updated: DirIntent to propagate draft field

# 2.0.18
- added: hybrid search support in AskGPTV2
- added: chunks_only option in AskGPTV2
- removed: hard-coded chat_url

# 2.0.16
- added: BASE_URL env var

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
