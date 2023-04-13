# Tiledesk tybotRoute

**npm @tiledesk/tiledesk-tybot-connector**

available on:
 ▶️ https://www.npmjs.com/package/@tiledesk/tiledesk-tybot-connector

### 0.1.75
- removed debug logs

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