const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
const { TiledeskChatbotConst } = require("../../engine/TiledeskChatbotConst");
const { TiledeskChatbotUtil } = require("../../utils/TiledeskChatbotUtil");
require('dotenv').config();
const winston = require('../../utils/winston');
const httpUtils = require("../../utils/HttpUtils");
const integrationService = require("../../services/IntegrationService");
const { Logger } = require("../../Logger");
const assert = require("assert");
const quotasService = require("../../services/QuotasService");

const conversionMap = {
  pdf_to_text: {
    extensions: ['.pdf'],
    base64Prefixes: ['JVBER'] // %PDF
  },
  xlsx_to_csv: {
    extensions: ['.xlsx', '.xlsm'],
    base64Prefixes: ['UEsDB'] // ZIP-based Office files
  },
  image_to_text: {
    extensions: ['.png', '.jpg', '.jpeg'],
    base64Prefixes: ['iVBOR', '/9j/'] // PNG, JPEG
  }
};

class DirAiTool {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.chatbot = this.context.chatbot;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.projectId = this.context.projectId;
    this.token = this.context.token;
    this.API_ENDPOINT = this.context.API_ENDPOINT;
    
    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.verbose("Execute AiTool directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.debug("DirAiTool Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[AiTool] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("DirAiTool action:", action);
    if (!this.tdcache) {
      winston.error("Error: DirAiTool tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;

    winston.debug("DirAskGPTV2 trueIntent", trueIntent)
    winston.debug("DirAskGPTV2 falseIntent", falseIntent)

    await this.checkMandatoryParameters(action).catch( async (missing_param) => {
      this.logger.error(`[AI Tool] missing attribute '${missing_param}'`);
      await this.chatbot.addParameter("flowError", "AiTool Error: '" + missing_param + "' attribute is undefined");
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return Promise.reject();
      }
      callback();
      return Promise.reject();
    })

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    const filler = new Filler();
    const filled_file_content = filler.fill(action.file_content, requestVariables);
    
    let AI_endpoint = process.env.AI_ENDPOINT;
    winston.verbose("DirAiTool AI_endpoint " + AI_endpoint);

    let headers = {
      'Content-Type': 'application/json'
    }

    let file_name;
    try {
      file_name = await this.getFileNameOrType(filled_file_content, action.conversion_type);
    } catch (err) {
      await this.chatbot.addParameter("flowError", "AiTool Error: " + err);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, null, falseIntent, null);
        callback(true);
        return Promise.reject();
      }
      callback();
      return Promise.reject();
    }
    
    let json = {
      file_name: file_name,
      file_content: filled_file_content,
      conversion_type: action.conversion_type
    }

    const HTTPREQUEST = {
      url: AI_endpoint + "/convert",
      headers: headers,
      json: json,
      method: 'POST'
    }
    winston.debug("DirAiTool HttpRequest: ", HTTPREQUEST);

    httpUtils.request(
      HTTPREQUEST, async (err, resbody) => {
        if (err) {
          winston.error("DirAiTool openai err: ", err);
          await this.#assignAttributes(action, "No answer");
          let error;
          if (err.response?.data?.detail[0]) {
            error = err.response.data.detail[0]?.msg;
          } else if (err.response?.data?.detail?.answer) {
            error = err.response.data.detail.answer;
          } else {
            error = JSON.stringify(err.response.data);
          }
          this.logger.error("[AI Tool] error executing action: ", error);
          if (falseIntent) {
            await this.chatbot.addParameter("flowError", "AiTool Error: " + error);
            await this.#executeCondition(false, trueIntent, null, falseIntent, null);
            callback(true);
            return;
          }
          callback();
          return;
        } else {

          winston.debug("DirAiTool resbody: ", resbody);
          answer = resbody.FileContent;
          this.logger.native("[AI Tool] answer: ", answer);
        
          await this.#assignAttributes(action, answer);

          if (trueIntent) {
            await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        }
      }
    )

  }

  async checkMandatoryParameters(action) {
    return new Promise((resolve, reject) => {
      let params = ['file_content', 'conversion_type']; // mandatory params
      params.forEach((p) => {
        if (!action[p]) {
          reject(p)
        }
      })
      resolve(true);
    })
  }

  async getFileNameOrType(input, conversion_type) {
  
    const config = conversionMap[conversion_type];
    if (!config) throw new Error(`Conversion type "${conversion_type}" non supportato.`);
  
    // base64 recognizer
    const trimmed = input.trim();
    for (const prefix of config.base64Prefixes) {
      if (trimmed.startsWith(prefix)) {
        return `file${config.extensions[0]}`;
      }
    }
  
    // URL recognizer
    try {
      const pathname = new URL(input).pathname;
      const fileName = pathname.split('/').pop();
  
      if (!fileName) return null;
  
      const lowerName = fileName.toLowerCase();
      if (config.extensions.some(ext => lowerName.endsWith(ext))) {
        return fileName;
      }
    } catch {
      throw new Error(`Extension not valid for conversion "${conversion_type}".`);
    }
  
    throw new Error(`Invalid URL or base64`);
  }
  

  async #executeCondition(result, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, callback) {
    let trueIntentDirective = null;
    if (trueIntent) {
      trueIntentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
    }
    let falseIntentDirective = null;
    if (falseIntent) {
      falseIntentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
    }
    if (result === true) {
      if (trueIntentDirective) {
        this.logger.native("[AI Tool] executing true condition");
        this.intentDir.execute(trueIntentDirective, () => {
          if (callback) {
            callback();
          }
        })
      }
      else {
        this.logger.native("[AI Tool] no block connected to true condition");
        winston.debug("DirAiTool No trueIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
    else {
      if (falseIntentDirective) {
        this.logger.native("[AI Tool] executing false condition");
        this.intentDir.execute(falseIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        this.logger.native("[AI Tool] no block connected to false condition");
        winston.debug("DirAiTool No falseIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
  }

  async #assignAttributes(action, answer) {
    winston.debug("DirAiTool assignAttributes action: ", action)
    winston.debug("DirAiTool assignAttributes answer: " + answer)

    if (this.context.tdcache) {
      if (action.assignReplyTo && answer) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignReplyTo, answer);
      }
    }
  }

}

module.exports = { DirAiTool }