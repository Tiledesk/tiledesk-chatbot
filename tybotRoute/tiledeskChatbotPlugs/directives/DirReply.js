const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../utils/TiledeskChatbotUtil');
let axios = require('axios');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { Logger } = require('../../Logger');
const aiService = require('../../services/AIService');
const winston = require('../../utils/winston')

function splitTextIntoTtsPhrases(text) {
  const s = String(text || '').trim();
  if (!s) {
    return [];
  }
  const pieces = s.split(/(?<=[.!?;])\s+|\n+/).map((p) => p.trim()).filter(Boolean);
  if (pieces.length <= 1 && s.length > 250) {
    return splitLongTextForTts(s, 250);
  }
  return pieces.length ? pieces : [s];
}

function splitLongTextForTts(s, maxLen) {
  const words = s.split(/\s+/);
  const out = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxLen && cur) {
      out.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) {
    out.push(cur);
  }
  return out.length ? out : [s];
}

function sendSupportMessagePromise(tdClient, requestId, msg) {
  return new Promise((resolve, reject) => {
    tdClient.sendSupportMessage(requestId, msg, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

class DirReply {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.projectId = context.projectId;
    this.requestId = context.requestId;
    this.token = context.token;
    this.tdcache = context.tdcache;
    this.log = context.log;
    this.API_ENDPOINT = context.API_ENDPOINT;
    this.API_URL = context.API_URL;
    
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___", log: this.log });
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action;
      if (!action.attributes) {
        action.attributes = {}
      }
      action.attributes.fillParams = true;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.error("DirReply Incorrect directive (no action provided):", directive);
      callback();
      return;
    }

    this.go(action, () => {
      this.logger.native("[Reply] Executed");
      callback();
    });
  }

  async go(action, callback) {
    const message = action;

    // fill
    let requestAttributes = null;
    if (this.tdcache) {
      requestAttributes = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );

      TiledeskChatbotUtil.replaceJSONButtons(message, requestAttributes);
      TiledeskChatbotUtil.replaceJSONGalleries(message, requestAttributes);

      const filler = new Filler();
      // fill text attribute
      message.text = filler.fill(message.text, requestAttributes);
      this.logger.native("[Reply] Reply with: " + message.text);

      if (message.metadata) {
        winston.debug("DirReply filling message 'metadata':", message.metadata);
        if (message.metadata.src) {
          message.metadata.src = filler.fill(message.metadata.src, requestAttributes);
          this.logger.native("Filled metadata.src with ", message.metadata.src);
        }
        if (message.metadata.name) {
          message.metadata.name = filler.fill(message.metadata.name, requestAttributes);
          this.logger.native("Filled metadata.name with ", message.metadata.name);
        }
      }
      winston.debug("DirReply filling commands'. Message:", message);
      if (message.attributes && message.attributes.commands) {
        let commands = message.attributes.commands;
        winston.debug("DirReply commands: " + JSON.stringify(commands) + " length: " + commands.length);
        
        if (commands.length > 0) {
          for (let i = 0; i < commands.length; i++) {
            let command = commands[i];
            if (command.type === 'message' && command.message && command.message.text) {
              command.message.text = filler.fill(command.message.text, requestAttributes);
              TiledeskChatbotUtil.fillCommandAttachments(command, requestAttributes);
              winston.debug("(DirReply) command filled: " + command.message.text);
            }

            if (command.type === 'message' && command.message && command.message.metadata) {
              command.message.metadata.src = filler.fill(command.message.metadata.src, requestAttributes);
              command.message.metadata.downloadURL = filler.fill(command.message.metadata.downloadURL, requestAttributes);
              winston.debug("(DirReply) command filled (metadata.src): " + command.message.metadata.src);
              winston.debug("(DirReply) command filled (metadata.downloadURL): " + command.message.metadata.downloadURL);
            }

            if (command.type === 'message' && command.message && command.message.type === 'tts') {
              command.message.text = filler.fill(command.message.text, requestAttributes);
              const ttsPhrases = splitTextIntoTtsPhrases(command.message.text);
              if (ttsPhrases.length <= 1) {
                const phraseForTts = ttsPhrases.length === 1 ? ttsPhrases[0] : String(command.message.text || '').trim();
                const voiceSettings = {
                  text: phraseForTts,
                  provider: requestAttributes['VOICE_PROVIDER'],
                  model: requestAttributes['TTS_MODEL'],
                  voice: requestAttributes['TTS_VOICE_NAME'],
                  language: requestAttributes['TTS_VOICE_LANGUAGE']
                };
                const voiceSpeech = await aiService.textToSpeech(voiceSettings, this.projectId, this.token);
                command.message.text = phraseForTts;
                command.message.metadata = {
                  type: voiceSpeech.contentType,
                  uid: Date.now().toString(36),
                  filename: `audio-${Date.now().toString(36)}.${voiceSpeech.contentType.split('/')[1]}`,
                  src: this.API_URL + "/files?path=" + voiceSpeech.filename
                };
                console.log("(DirReply) command filled (tts): " + phraseForTts);
                winston.debug("(DirReply) command filled (tts metadata): " + JSON.stringify(command.message.metadata));
              } else {
                command._ttsPhrases = ttsPhrases;
                console.log("(DirReply) tts split into " + ttsPhrases.length + " phrases (deferred TTS + send)");
              }
            }

            if (command.type === 'settings' && command.settings) {
              Object.keys(command.settings).forEach(k => {
                command.settings[k] = filler.fill(command.settings[k], requestAttributes)
                winston.debug("(DirReply) settings command filled: " + command.settings[k]);
              })
            }
          }
        }
      }

      // EVALUATE EXPRESSION AND REMOVE BASED ON EVALUATION
      winston.debug("DirReply message before filters: ", message);
      if (message.attributes && message.attributes.commands) {
        winston.debug("DirReply filterOnVariables...on commands", message.attributes.commands)
        winston.debug("DirReply filterOnVariables...on attributes", requestAttributes);
        TiledeskChatbotUtil.filterOnVariables(message, requestAttributes);
      }
      // temporary send back of reserved attributes
      if (!message.attributes) {
        message.attributes = {}
      }
      // Reserved names: userEmail, userFullname
      // if (requestAttributes['userEmail']) {
      //     message.attributes.updateUserEmail = requestAttributes['userEmail'];
      // }
      // if (requestAttributes['userFullname']) {
      //   message.attributes.updateUserFullname = requestAttributes['userFullname'];
      // }
      // intent_info
      
      // REFACTOR - START
      if (this.context.reply.intent_display_name) {
        message.attributes.intentName = this.context.reply.intent_display_name;
      }
      else if (this.context.reply && this.context.reply.attributes && this.context.reply.attributes.intent_info) {
        message.attributes.intentName = this.context.reply.attributes.intent_info.intent_name;
      }
      // REFACTOR - END


      // userFlowAttributes
      let userFlowAttributes = TiledeskChatbotUtil.userFlowAttributes(requestAttributes);
      winston.debug("DirReply userFlowAttributes:", userFlowAttributes);
      if (userFlowAttributes) {
        message.attributes["flowAttributes"] = {};
        for (const [key, value] of Object.entries(userFlowAttributes)) {
          try {
            if(typeof value === 'string' && value.length <= 1000){
              message.attributes["flowAttributes"][key] = value;
            }
          }
          catch(err) {
            winston.error("DirReply An error occurred while JSON.parse(). Parsed value:" + value + " in allParametersStatic(). Error:", err);
          }
        }
      }

      if (message.attributes && message.attributes.commands) {
        const cmds = message.attributes.commands;
        const voiceBase = {
          provider: requestAttributes['VOICE_PROVIDER'],
          model: requestAttributes['TTS_MODEL'],
          voice: requestAttributes['TTS_VOICE_NAME'],
          language: requestAttributes['TTS_VOICE_LANGUAGE']
        };
        const filesBaseUrl = this.API_URL || this.API_ENDPOINT || '';
        let removedSplitTtsCommand = false;
        for (let i = cmds.length - 1; i >= 0; i--) {
          const cmd = cmds[i];
          if (cmd.type !== 'message' || !cmd.message || cmd.message.type !== 'tts' || !cmd._ttsPhrases) {
            continue;
          }
          const phrases = cmd._ttsPhrases;
          delete cmd._ttsPhrases;
          const phraseList = phrases.filter((p) => p && String(p).trim());
          for (let p = 0; p < phraseList.length; p++) {
            const phrase = phraseList[p];
            const voiceSpeech = await aiService.textToSpeech(
              { ...voiceBase, text: phrase },
              this.projectId,
              this.token
            );
            const metadata = {
              type: voiceSpeech.contentType,
              uid: `${Date.now().toString(36)}-${i}-${p}`,
              filename: `audio-${Date.now().toString(36)}-${i}-${p}.${voiceSpeech.contentType.split('/')[1]}`,
              src: filesBaseUrl + "/files?path=" + voiceSpeech.filename
            };
            const chunkMsg = {
              text: phrase,
              senderFullname: this.context.chatbot.bot.name,
              attributes: {
                ...message.attributes,
                commands: [{
                  type: 'message',
                  message: {
                    type: 'tts',
                    text: phrase,
                    metadata
                  }
                }]
              }
            };
            await TiledeskChatbotUtil.updateConversationTranscript(this.context.chatbot, chunkMsg);
            await sendSupportMessagePromise(this.tdClient, this.requestId, chunkMsg);
            winston.debug(`(DirReply) tts chunk ${p + 1}/${phraseList.length} sent`);
          }
          cmds.splice(i, 1);
          removedSplitTtsCommand = true;
        }
        if (removedSplitTtsCommand && requestAttributes) {
          TiledeskChatbotUtil.filterOnVariables(message, requestAttributes);
        }
      }
    }

    let cleanMessage = message;
      
    cleanMessage.senderFullname = this.context.chatbot.bot.name;
    winston.debug("DirReply reply with clean message: ", cleanMessage);
    this.logger.native("[Reply] Reply with 2: " + cleanMessage.text);

    await TiledeskChatbotUtil.updateConversationTranscript(this.context.chatbot, cleanMessage);
    this.tdClient.sendSupportMessage(
      this.requestId,
      cleanMessage,
      (err) => {
        if (err) {
          winston.error("DirReply Error sending reply: ", err);
          this.logger.error("[Reply] Error sending reply: " + err);
        }
        winston.verbose("DirReply reply message sent")
        const delay = TiledeskChatbotUtil.totalMessageWait(cleanMessage);
        if (delay > 0 && delay <= 30000) { // prevent long delays
          setTimeout(() => {
            callback();
          }, delay);
        }
        else {
          callback();
        }
    });

  }

}

module.exports = { DirReply };