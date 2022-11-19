# Tiledesk tybotRoute

**npm @tiledesk/tiledesk-tybot-connector@0.1.22**

available on:
 ▶️ https://www.npmjs.com/package/@tiledesk/tiledesk-tybot-connector

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