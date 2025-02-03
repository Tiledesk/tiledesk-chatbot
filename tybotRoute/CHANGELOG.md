# Tiledesk tybotRoute

**npm @tiledesk/tiledesk-tybot-connector**

available on:
 ▶️ https://www.npmjs.com/package/@tiledesk/tiledesk-tybot-connector

<!-- // CHECK IT!!!
# v0.2.98
- Added possibility to select namespace by name
- Added filler to namespace in DirAskGPTv2 
- Added filler to command.settings in DirReply	

# v0.2.97
- Added a limit in upload and download for WebRequestV2: maxContentLength: 10000000, // max 10mb response size, maxBodyLength: 10000000 // max 10mb request body size
- Added jsonCondition test on json objects properties
- Added flowError on JSONCondition when result = null
- Added fix on Filler -->

# v0.2.145
- added: TILEBOT_ENDPOINT env variable to startApp method

# v0.2.144
- Removed userFlowAttributes from message.attributes (fix message too long issue)

# v0.2.143
- Changed: env var TILEBOT_ENDPOINT replaced with TILEBOT_ENDPOINT

# v0.2.142
- Bug-fix: action.isInfo added in DirMessage fo fix test

# v0.2.141
- Bug-fix: message.attributes.payload not visible on first message

# v0.2.140
- Bug-fix: block hidden message for non-dev conversation

# v0.2.139
- Added ReplaceBotV3 action
- Updated Redis to 4.7.0

# v0.2.138
- Bug-fixed: hiddenMessage not blocked
- Bug-fixed: DirAskGPTV2 has hardcoded engine

# v0.2.138-rc8
- Updated redis to 4.7.0
- Updated tdCache

# v0.2.138-rc6
- First deploy external

# v0.2.138-rc1
- Updated redis to 4.7.0
- Updated tdCache

# v0.2.137
- Updated: hidden message is enabled only in dev mode for dratf requests
- Bug-fixed: flows variables is not updated with attributes.payload

# v0.2.136
- TdCache rollback

# v0.2.135
- Updated to redis 4.7.0 + Tdcache.js
- Disabled close_directive_test.js - DirClose directive - too old, not passing
- Disabled conversation-gpt_assistant_test.js

# v0.2.134
- Added filter for mweb on hidden messages

# v0.2.133
- Removed MAX_STEPS and MAX_EXECUTION_TIME as static variable of TiledeskChatbot

# v0.2.132
- Added support for external API_ENDPOINT
- Removed logs

# v0.2.131-rc2
- changed API_URL with API_ENDPOINT

# v0.2.131
- added: AUDIO_RECORD vxml action as reply_v2 actionType
- added: DirAddTags action
- externalized: process.env.CHATBOT_MAX_STEPS and process.env.CHATBOT_MAX_EXECUTION_TIME

# v0.2.130
- (TiledeskChatbotUtil) fix process.env.API_ENDPOINT => process.env.API_URL
- index.js /block => added "token": "NO-TOKEN"
- (TiledeskChatbotUtil) added: chatbot.addParameter(TiledeskChatbotConst.API_BASE_URL, process.env.API_ENDPOINT);

# v0.2.130-rc5
- (TiledeskChatbotUtil) fix process.env.API_ENDPOINT => process.env.API_URL

# v0.2.130-rc4
- (TiledeskChatbotUtil) process.env.API_ENDPOINT => process.env.API_URL

# v0.2.130-rc3
- index.js /block => added "token": "NO-TOKEN"
- (TiledeskChatbotUtil) added: chatbot.addParameter(TiledeskChatbotConst.API_BASE_URL, process.env.API_ENDPOINT);

# v0.2.129 -> test
- (TiledeskChatbot) sending as "info": "An error occurred while getting locked intent:'" + locked_intent + "'"
- (DirectivesChatbotPlug) added try catch on new TiledeskClient() => try {tdclient = new TiledeskClient({...})}

# v0.2.128 -> test
- Updated axios from 0.27.2 to 1.7.7
- fixes tdcache .set() with callback

# v0.2.127 -> test
- TiledeskChatbot =>
  - static MAX_STEPS = 1000;
  - static MAX_EXECUTION_TIME = 1000 * 3600 * 8;

# v0.2.126 -> test
- TdCache async del(key, callback) FIXED (await unsupported problem)

# v0.2.125 -> test
- class TiledeskChatbot static MAX_STEPS = 1000;
- class TiledeskChatbot static MAX_EXECUTION_TIME = 1000 * 3600 * 6; Increased from 4 => 6 hours

# v0.2.124 -> test
- TiledeskChatbot.js: fixed problem with locked-intent error.
- DirectivesChatbotPlug -> errorMessage is now hidden
- TESTING WITH VALUES: static MAX_STEPS = 10 && MAX_EXECUTION_TIME = 1000 * 60 * 2; (2 minutes)

# v0.2.123 -> test
- DirSendEmail removed log

# v0.2.122 -> test
- fixed check if (!this.validWebhookURL(this.webhookurl)) {... on WebhookChatbotPlug.js with return
- removed logs, err => JSON.stringify(err)

# v0.2.121 -> test
- added check if (!this.validWebhookURL(this.webhookurl)) {... on WebhookChatbotPlug.js

# v0.2.120 -> prod
- removed check in go() - it is already in execute() - on SetAttributeV2: if (!action) {...}
- merged Whatsapp Action
- updated "@tiledesk/tiledesk-client": "^0.10.13"

# v0.2.119 -> test
- fixed: addParameter("payload", message) => addParameter("payload", message.attributes.payload)
- JSONCondition: added in constructor => this.chatbot = context.chatbot;

# v0.2.118 -> test
- added payload to attributes: await chatbot.addParameter("payload", message);

# v0.2.117 -> test
- block endpoint fixed with APIURL

# v0.2.116 -> test
- updates @tiledesk/tiledesk-client => v0.10.12

# v0.2.115 -> test
- removed log console.error("TiledeskExpression.evaluate() error:...")
- Log setting fix in DirectivesChatbotPlug: const tdclient = new TiledeskClient({...
- SetAttributeV2: added check for action null: if (!action) {...
- SetAttributeV2:added check with ? operator: if (action.operation?.operators === undefined && ...

# v0.2.114 -> test
- Creating draft webhook endpoint on index.js: router.post('/block/:project_id/:bot_id/:block_id' ...
- Added check on attribute size < 20Mb
- SetAttributeV2: added persistency service

# v0.2.113 -> prod
- Fixed DirClose not importing TiledeskChatbotConst

# v0.2.112 -> prod
- Fix index name in DirAskGPTV2

# v0.2.111 -> test
- Updated DirAskGPTV2 with engine support

# v0.2.110 -> test
- Added DirMoveToUnassigned
- Added DirConnectBlock

# v0.2.109 -> test
- Added DirMoveToUnassigned
- Fixed bug: GptTask doesn't work properly with trascript

# v0.2.108 -> test
- Added chatbot_id
- Added support for citations in AskGPTV2
- Added support Json type in GPT Task

# v0.2.107 -> production
- clean logs (more)

# v0.2.106 -> production
- clean logs

# v0.2.105 -> production
- clean logs

# v0.2.104 -> production
- isValid fixed

# v0.2.103 -> test
- isValid removed

# v0.2.102
- isValid modified: if (parts.length >= 4) instead of "if (parts.length === 4)" that blocked whatsapp requests

# v0.2.101
- Dynamic attribute "now" is a ISOString date
- MAX_EXECUTION_TIME = 1000 * 3600 * 4 // 4 hours

# v0.2.100 -> test
- Added "chatbotToken" to RESERVED attributes
- Added UUID, UUIDv4 dynamic attributes
- Remove console.error from Filler liquidJS catch clause

# v0.2.98
- Support for MAX_EXECUTION_TIME (total execution time of a flow without user interaction)
- MAX_STEPS = 1000
- MAX_EXECUTION_TIME = 12 hrs

# v0.2.97
- Added support for "chatbotToken” attribute
- Added new Action: clear_transcript
- Exclude transcript generation when request type differs from "support-group-*"
- "step" key reset on DirWait => this.chatbot.addParameter( step_key, 0 )

# v0.2.96
- Added timestamp (number) and now (Date Object) attributes

- Added a limit in upload and download for WebRequestV2: maxContentLength: 10000000, // max 10mb response size, maxBodyLength: 10000000 // max 10mb request body size
- Added jsonCondition test on json objects properties
- Added flowError on JSONCondition when result = null
- Added fix on Filler

- Added possibility to select namespace by name
- Added filler to namespace in DirAskGPTv2 
- Added filler to command.settings in DirReply	

# v0.2.95
- If Online Agents V2 - bug fix (If Project Available Agents V2 -> MWeb)

# v0.2.94
- Added support for chat history for AskGPTv2 action

# v0.2.93
- Added model contexts

# v0.2.92
- Improved GPTTask Action with support for history

# v0.2.91
- Added voice flow attributes: dnis, callId, ani

# v0.2.89
- Added convertToNumber to operations in setAttribute
- Added setAttributeV2 test

# v0.2.88
- Added DirContactUpdate (aka LeadUpdate). No test case added for LeadUpdate. Only testable with a validation test.
- Fixed: Attribute parameters userFullname & userEmail now are able to "bypass" the request.lead not correctly updating on the same conversation. If updated in the flow (through LeadUpdate action), they will maintain their own value through the current conversation flow.

# v0.2.87
- Fixed DirAssistant empty error {}
- Added to DirAssistant "lastMessageData" attribute (The message content original JSON structure useful to get annotations in messages, message type etc.)

# v0.2.86
- Added to ifOnlineAgents Action: ignoreProjectWideOperatingHours = action.ignoreOperatingHours;
- Updated ifOnlineAgents with get available agents with 'raw' option

# v0.2.85
- Improved "If operating hours" action with time slots
- Other fix (?)

# v0.2.84
- Fixed "guest#" bug
- Fixed default_context in AskGPTv2

# v0.2.83
- Added support for advanced context in AskGPTv2

# v0.2.82
- Added {context} in 'system_context' in AskGPTv2

# v0.2.81
- Changed from 'context' to 'system_context' in AskGPTv2

# v0.2.80
- Changed AskGPT Action to support namespaces

# v0.2.79 - dev
- Fixed. Get DepartmentId for default department in test-mode in IfOnelineAgentsV2 with correct attribute get with chatbot.getParameter()

# v0.2.78 - dev
- Fixed? Get DepartmentId for default department in test-mode in IfOnelineAgentsV2

# v0.2.77 - dev
- Fix. get images and urls. image URL was Wrongly removed after the upload message

# v0.2.76 - dev
- Added support to button alias

# v0.2.75 - dev
- Fix. get images and urls also without text
- "userLeadId" = message.request.lead._id (instead of the unuseful lead.lead_id)

# v0.2.74 - online
- Fix. Get DepartmentId for default department in test-mode in IfOnelineAgentsV2

# v0.2.73 - debug
- Fix. static getMachine with check on bot not null

# v0.2.72
- Fix. userParams not in /reserved...

# v0.2.71
- Fix. DirReplyV2 "NoInput" bug. Refactored with the introduction of "timeout_id", an ID specific for each noInput timeout: this.chatbot.addParameter(TiledeskChatbotConst.USER_INPUT, timeout_id)

# v0.2.70
- added DirIfOnlineAgentsV2
- Fix. TiledeskChatbot: WRONG: await chatbot.addParameter("userInput", true); ====>    FIXED: this.addParameter("userInput", true)
- Fix. Fixed WRONG addParameter(key, value) invocation in TiledeskChatbot with 3 (instead of key, value) parameters

# v0.2.69
- added flow attributes in reply action (original)

# v0.2.68
- added flow attributes in replyv2 action
- ReplyV2 now "re-forwards" the original message when the "no-match" connector is undefined (behaving exactly like the classic Reply)

# v0.2.67
- console.log crash fixed on noinput

# v0.2.66
- changed updateQuotes method
- fix missing model in updateQuote
- added ReplyV2

# v0.2.66-rc1
- fix missing model in updateQuote

# v0.2.65 - online
- fix OPENAI_APIKEY: removed Bearer prefix

# v0.2.64
- removed system parameters from /reserved/parameters
- Web Request Action: added multipart form-data support with files binary from URL source
- Added DirAssistant Action

# v0.2.63
- BUG fix on /ext/parameters/requests/:requestid
- Moved getChatbotParameters function in TiledeskChatbotUtil

# v0.2.62
- Whatsapp fix (transcript error whitout "senderFullname")

# v0.2.62-rc4
- Whatsapp fix (transcript error whitout "senderFullname")

# v0.2.62-rc1
- Added VXML actions (speech_form, play_prompt)

# v0.2.61
- fixed WebRequestv2 timeout

# v0.2.61-rc1
- Added VXML actions (dmtf_menu, dtmf_form, blind_transfer)

# v0.2.60
- added flow attributes:
- lastUserDocumentAsAttachmentURL: Document as a downloadable on click
- lastUserDocumentAsInlineURL: Document as "view inline" on click
- flow attribute "strongAuthentication" renamed in "strongAuthenticated"

# v0.2.59
- added flow attribute "strongAuthentication" mapped on request.requester.isAuthenticated (true|false)

# v0.2.58
- added settings.timeout option to WebRequestv2
- added TiledeskChatbotUtil.transcriptJSON(transcript)
- added flow attribute "decodedCustomJWT"

# v0.2.57
- fixed catching reply error in index.js: reply = await chatbot.replyToMessage(message);
- Added context and top_k parameter in DirAskGPTV2

# v0.2.56
- Fixing Customerio Action not passing testing

# v0.2.55
- Added try-catch in allParametersStatic() To log some weird attributes wrongly unparsed by JSON.parse
- Removed logs

# v0.2.54
- Fix bug: DirHubspot didn't return any result

# v0.2.53
- Fix bug: missing check for callback in executeCondition in DirHubspot

# v0.2.52
- Fix bug: wrong call at getKeyFromIntegration in Qapla' directive

# v0.2.51
- Improved AskGPTV2 action
- Added Hubspot action
- Added Customerio action (hidden)

# v0.2.50
- Added AskGPTV2 action

# v0.2.49
- resplacebotv2, added "/" + blockName (so the blockname will be implicitly executed), removing the need to specify the "/" in the body of the replacebot editor
- Never add "guest#" as lead userFullname

# v0.2.48
- resplacebotv2
- fixed jsoncondition expression. added ? in some "static OPERATORS" (i.e. contains) to correctly evaluate undefined operands

# v0.2.47
- added isNull isUndefined conditions

# v0.2.45
- Fix: JSON.stringify. Removed String(#1) convertion

# v0.2.44
- Fix: attributes not showing in button.value

# v0.2.43
- DirCode: tiledeskVars renamed in "context"
- DirCode: tiledeskVars.setVar renamed in context.setAttribute()
- DirCode: tiledeskVars.delVar renamed in context.deleteAttribute()
- DirCode: added context.attributes property to access flow's attributes

# v0.2.42 (online)
- WebRequestV2 fix. Now you'll get the response payload (in the result) also on errors

# v0.2.41
- added attribute currentPhoneNumber
- added attribute tickeId

# v0.2.40
- refactorized Make action
- added support for public gptkey for GptTask and AskGPT actions
- fixes bug: AskGPT action not working

# v0.2.39
- fixed bug: wrong update of userFullname based on lead.fullname

# v0.2.38
- improved Qapla' action with condition

# v0.2.37
- improved GptTask action with condition
- improved AskGPT action with condition

# v0.2.36
- Fixes json conversion in GptTask issue

# v0.2.35
- added validation check for requests ids (support-group- && automation-request-)
- refactorized GptTask, AskGPT and Qapla actions in order to support integrations
- added integrated condition in GptTask 
- added automatic JSON conversion in GptTask

# v0.2.34
- stopOnConditionMet is always true in DirJSONCondition
- Fixes the WebRequestV2 branching

# v0.2.33
- Added lead attributes (userEmail, userPhone, userFullname, userLeadId, userCompany)

# v0.2.32
- Added attributes filling to message.metadata.src
- Added attributes filling to message.metadata.name

# v0.2.31
- Removed patch: Added support for removing empty text from replies: TiledeskChatbotUtil.removeEmptyReplyCommands()

### v0.2.30
- Updated WhatsappByAttribute action
- Fixed bug: WhatsappByAttribute action pointed to whatsapp pre

### v0.2.29
- Added Make action 

### v0.2.28
- DirSetAttribute, added support for attribute-filling in constants
- DirSetAttribute, added function JSONparse
- Added support for Globals (aka Secrets)

### v0.2.27
- Added support for removing empty text from replies: TiledeskChatbotUtil.removeEmptyReplyCommands()
- Removed non-user-defined attributes from /ext/parameters method

### v0.2.26
- Updated Qapla Action (tracking number from filler)

### v0.2.25
- added support for native connect to block
- added TiledeskChatbotUtil.addConnectAction()

### v0.2.24
- Added Qapla action
- Fixed bug: the 3.5 turbo model was always used in GptTask action

### v0.2.23
- Fixed CaptureUserReply. Added Check for missing goToIntent
- When channelName == "chat21" it will be renamed in "web"

### v0.2.22
- Fixed "TildeskChatConst.js is not defined" in index.js
- added System attribute "channelName"

### v0.2.21
- log clean
- added log for production in IfOnlineAgent
- Deprecated IfAvailableAgents
- index.js refactored. Moved static utility methods in TiledeskChatbotUtil.js

### v0.2.20
- updateRequestVariables renamed in updateRequestAttributes
- Added TildeskChatbot instance method async getParameter(parameter_name)
- Added "transcript" attribute

### v0.2.19
- Added native attribute lastUserMessageType
- Added integration with external intents decode engine
- Added support for automatic wait time on each reply

### v0.2.17
- Added lastUserMessage JSON native attribute
- Added attributes to access image and file properties from incoming messages
- Added support for JSON attributes in conditions
- Added backupIntentsFinder based on Fulltext in TiledeskChatbot

### v0.2.16
- update whatsapp api url for pre environment

### v0.2.15
- replyto in send email fix

### v0.2.14
- pre-release

### v0.2.13 - test
- replyto send email test

### 0.2.12
- Updated @tiledesk/tiledesk-client => 0.10.4 to support the new email endpoint

### 0.2.11
- TiledeskClient update to 0.10.3
- updateLead() replaces the deprecated updateLeadData()
- added support to automatically update userPhone as well as the already supported userEmail and UserFullname
- fixed form messages: missing replace of {{...}} attributes

### 0.2.10 - online pre
- WebRequest: "body" renamed in "jsonBody"

### 0.2.9 - online
- restored logs

### 0.2.1 - online
- bug fix:  /ext/parameters/requests/:requestid replies with res.send([]);
- bug fix: allParameterStatic() => check for attributes not null before iterating Object.entries()

### 0.2.0 - online, unused
- bug fix

### 0.1.99
- webrequest json fix (jsonBody renamed to "body")
- webrequest added bodyType attribute (none | json)

### 0.1.98 - online
- added default EX:86400 to exprire time to tdcache.set()
- added "chatbot" instance to DirectivesChatbotPlug instance created in index.js
- added Capture user Reply
- added triggerBot to DirDepartment

### 0.1.96 - online

### 0.1.95
- Fix: missing key API_ENDPOINT in production
- added "message: message" to DirectivesChatbotPlug instance created in index.js

### 0.1.94
- Fix: last_user_message on _tdInternal sender
- Fix: missing filled question on GptTask Action
- Improvements of GptTask Action

### 0.1.93
- Added GptTask Action

### 0.1.92
- Added new WebRequest 2.0
- Added AskGPT action
- fix: added webhook_url to bot removed some bad console.log added test for webhooks

### 0.1.91
- Added control for attribute_value null in DirWhatsappByAttribute

### 0.1.90
- Added support for JSON/Number/string parameters in /intent[] invocation
- Added support for JSON/Number/string parameters in attributes.payload invocation
- Added DirWhatsappByAttribute
- Test external process.env (PASSED)

### 0.1.89
- DirWebRequest: fixed sending data: 'null'
- Improved MockBotsDataSource.js to support search also by intent_id
- Added test for Qapla WebRequest

### 0.1.88
- Added language parse with accept-language-parser. Now user_language has just the first language ISO code

### 0.1.87
- Fixed commands-merged text in replies (text was empty for non messages with no filters)
- Renamed env LOG var from API_LOG to TILEBOT_LOG

### 0.1.86
- Added OPERATOR "notStartsWith"

### 0.1.85
- "Match (regex) operator" fix
- Text in multiple message commands is now merged in main "message.text" property based on filtered commands

### 0.1.84
- removed debug logs

### 0.1.83
- added "attributes.intentName" in chatbot replies, showing the last block involved in generating the reply

### 0.1.82
- added /echobot endpoint (only used for performance test)
- @tiledesk/tiledesk-client update => 0.10.2

### 0.1.81
- added expire to intent (faq) cache: await tdcache.set(faqCacheKey, JSON.stringify(faq), {EX: 86400})

### 0.1.80
- removed log "faq not found, getting from datasource..."
- added in Directive IF_ONLINE_AGENTS "stop" in async (stop)

### 0.1.79
- added Handlebars.registerHelper('ifeq'... helper

### 0.1.78
- web request assign-to fix
- fix filter on messages: groups removed

### 0.1.77
- Refactored DirDeflectToHelpcenter. Added projectId option (to allow search from workspaces in different projects)
- increased MAX_STEPS for MAX ACTIONS EXEEDED error, from 20 to 200

### 0.1.76
- added projectId debug log for production

### 0.1.75
- introduced WebRequest action.assignments
- created TiledeskJSONEval class supported by handlebars
- removed debug logs
- added handlebars lib

### 0.1.74
- DEBUG VERSION
- Added if (log || projectId === "64218dfecdb804001380b9ba")

### 0.1.73
- Bug fixing: WebRequest headersString now is a JSON

### 0.1.72
- Removed error-prone request caching.
- Added botId caching on requestId with key: request_botId_key

### 0.1.71 - online
- Log clean up

### 0.1.70
- Removed system attributes from request /parameters service

### 0.1.69
- Removed tdclient.updateRequestAttributes(requestId, preChatForm: all_parameters)

### 0.1.68
- Log clean

### 0.1.67
- adds tdActionId to Schema for SetAttribute
- removes hidden vars from attributes

### 0.1.66
- Replaced tdClient.agent() with tdCLient.moveToAgent() in DirMoveToAgent

### 0.1.65 - online
- Added more logs for bug wa-wh test

### 0.1.64 - online
- Added logs for bug wa-wh test

### 0.1.63 - online
- Added stopOnConditionMet to DirIfOnlineAgents
- Removed deprecated Directive Directives.WHEN_OFFLINE_HOURS
- Removed deprecated Directive Directives.DISABLE_INPUT_TEXT
- Removed deprecated Directive Directives.WHEN_OPEN
- Removed deprecated Directive Directives.WHEN_CLOSED
- Removed deprecated Directive Directives.IF_AGENTS
- Removed deprecated Directive Directives.IF_NO_AGENTS
- Added support for intent parameters in DirJSONCondition DirIfOnlineAgents DirIfOpeningHours
- Added JSONCondition with intent parameters test

### 0.1.63 - online
- Added support for depId-from-supportRequest in DirMoveToAgent. This fixes no-handoff in test-it-out and from Dialogflow connector

### 0.1.62
- Added TiledeskChatbotUtil.fillCommandAttachments() replacing vars in commands.button.link

### 0.1.61
- Added DirRandomReply, TiledeskChatbotUtil.chooseRandomReply()

### 0.1.60
- fixed: get department_id from message.request instead of message.attributes
- added JSONOperationToExpression evaluator in TiledeskExpression

### 0.1.59
- Log clean

### 0.1.58
- Introduced a regex to check variable names correctness

### 0.1.57
- Added Filter on message.commands based on optional _tdJSONCondition field
- TiledeskExpression: introduced "type" for operand2 (type: "const" and type: "var")
- added addParameter(TiledeskChatbotConst.REQ_CHAT_URL, chat_url)
- renamed all system attributes, "td" prefix removed
- added class IntentsMachineFactory
- added headersString in WebRequest
- fixed await bot bug. Full text search and webhook affected

### 0.1.56
- DirWebRequest added
- SetAttribute added
- JsonCondition added

### 0.1.55
- fixed bug on DirCondition $data. replace with regex

### 0.1.54
- bug fixing

### 0.1.53
- removed projectId from query MongodbBotsDataSource.getByExactMatch()
- removed projectId from query MongodbIntentsMachine.decode()
- added on DirCondition the stopOnConditionMet option

### 0.1.52
- added tdChatbotName to request variables
- removed _ from _td prefix in tiledeskVariables (i.e. _tdDepartmentId => tdDepartmentId)
- added tdcache.hget()
- fixed bug on DirAgentHandoff. this.dirId missed on intent-to-intent crashed the application. Getting tdDepartmentId from Redis
- removed projectId from query MongodbBotsDataSource.getByIntentDisplayName()

### 0.1.51
- only debug on pre

### 0.1.50
- bug fixing
- multilang prototype

### 0.1.49
- anomaly detection
- bug fix

### 0.1.48
- fixed ReplaceBot "log" bug
- ReplaceBot fill-variables botName
- fixing

### 0.1.47
- Introduced _tdIfOnlineAgents --trueIntent -- falseIntent
- Refactored _tdIfOpenHours --trueIntent -- falseIntent
- Removed DirIfNotOpenHours
- Refactored *context* passing *tdclient* object
- bug fixing

### 0.1.46
- weird npm import fix

### 0.1.45
- DirLockIntent added varibleName parameter

### 0.1.44
- Variables to webhook

### 0.1.43
- added context variable chatbot.addParameter("_tdRequestId", requestId);
- completed TiledeskIntentsMachine.js
- tdCondition
- tdAssign
- /IntentName{"variableName":"value", ...}

### 0.1.42
- added IntentForm pre-set variables skipping

### 0.1.41
- added Filler
- added Filler to email .to .subject .text attributes

### 0.1.40
- tiledesk-client => 0.9.5
- added _tdSendEmail directive

### 0.1.39 - online
- ExtApi.sendSupportMessageExt => added support for rejectUnauthorized: false

### 0.1.38 - online
- tiledesk-client => 0.9.3

### 0.1.37 - online
- log clean

### 0.1.36 - online
- added /ext/params/requests/:requestid service
- removed requestId as parameter of addParameter()/allParameters() of TiledeskChatbot instance method
- added testing intent_form_test.js for IntentForm
- improved conversation1 test with parameters check

### 0.1.35
- fix updateLeadData (email, fullname, reply.attributes.updateUserFullname)

### 0.1.34 - online
- @tiledesk/tiledesk-client => 0.9.2 - TiledeskClient.version09()

### 0.1.32 - online
- @tiledesk/tiledesk-client => 0.8.42 - it now defaults to rejectUnauthorized=false for HTTPS connections

### 0.1.31 - online
- Fixed bot_answer["_raw_message"] moved to bot_answer.attributes.["_raw_message"] 

### 0.1.30 - online
- Fixed wrong bot_answer["_raw_message"]

### 0.1.29 - online
- Added process.exit(1) in tybot-route.startApp when no Redis connection is available to facilitate Cluster start
- Debug console.log() removed.

### 0.1.28 - online
- Added a 'serious' integration test for chatbot
- Removed reference to requestId and depId from processInlineDirectives()
- Added id_project to the 'minimum' request object used in directives not accessing Tiledesk APIs

### 0.1.27 - online
- log fix

### 0.1.26 - online
- no message is sent when there is no message for markbot out of the pipeline. Only directives are admitted.

### 0.1.25
- introduced new \_tdIfNoAgents \_tdIfAgents (DirIfAvailableAgents)

### 0.1.24
- @tiledesk/tiledesk-client => 0.8.39

### 0.1.23
- introduced new DirClose \_tdClose
- introduced new DirWhenOpen \_tdWhenOpen \_tdWhenClosed
- introduced DirDisableInputText \_tdDisableInputText
- fixed form intent-blocking bug

### 0.1.22
- introduced new DirDepartment class

### 0.1.21
- fixed orginal_text unused var that creating problems in DirOfflineHours

### 0.1.20
- bug fixing on ExtApi endpoint (External chatbots compromised messaging)

### 0.1.19
- fixed action-intent not working

### 0.1.18
- removed support for CACHE_ENABLED.
- Redis is now mandatory: settings.REDIS_PORT, settings.REDIS_HOST are mandatory. settings.REDIS_PASSWORD is optional

### 0.1.17
- removed deprecated files

### 0.1.16
- added Redis support to share some parameters (message.requestId, message.projectId) with Apps

### 0.1.15
- refactored with the models/TiledeskChatbot class
- added triggeredByMessageId property to the bot reply
- added "tdMessageId" parameter to be used during processing

### 0.1.14 online
- more replaceAll moved to replace(//)
- console.log clean

### 0.1.13 online
- replaceAll replaced by replace(//)
- TEMP: const depId = supportRequest.department._id

### 0.1.12 online - TEMP: const depId = supportRequest.department._id;

### 0.1.11 online - logs update for debug deflect to help center directive parsing

### 0.1.9 online - set log on ExtApi class

### 0.1.8 online - fixed: import minimist-string fix

### 0.1.7 online - fixed: converted function process() to Arrow function: const process = (directive) => {}

### 0.1.6 online - API_ENDPOINT fix for sendMessageExt. Getting it from tyboyRoute property API_ENDPOINT

### 0.1.5 - ExtApi added - New directives added (DirWait, DirMessage, DirReplaceBot)

### 0.1.4 updated "@tiledesk/tiledesk-chatbot-plugs" to "^0.1.8"

### 0.1.2 fixes to enhance as-a-route installation

### 0.1.1 added \_td prefix to directives. Keeping the legacy \agent directive

### 0.1.0 first release