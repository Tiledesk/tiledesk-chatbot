const winston = require('../utils/winston');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot');
const { MongodbBotsDataSource } = require('../engine/MongodbBotsDataSource');
const { MockBotsDataSource } = require('../engine/mock/MockBotsDataSource');
const { IntentsMachineFactory } = require('../engine/IntentsMachineFactory');

let staticBots = null;
let MAX_STEPS = 1000;
let MAX_EXECUTION_TIME = 1000 * 3600 * 8;

class SubagentResumeService {

  static configure(options = {}) {
    if (options.staticBots !== undefined) {
      staticBots = options.staticBots;
    }
    if (options.MAX_STEPS !== undefined) {
      MAX_STEPS = options.MAX_STEPS;
    }
    if (options.MAX_EXECUTION_TIME !== undefined) {
      MAX_EXECUTION_TIME = options.MAX_EXECUTION_TIME;
    }
  }

  /**
   * Resume the parent bot flow inline after returnstack replace.
   * Loads the parent bot, updates request↔bot mapping, and awaits directive processing.
   */
  static async resumeParentFlow(parentState, context) {
    if (!parentState || !parentState.parentBotId) {
      throw new Error('(SubagentResumeService) parentState with parentBotId is mandatory');
    }
    if (!context?.tdcache) {
      throw new Error('(SubagentResumeService) context.tdcache is mandatory');
    }

    const parentBotId = parentState.parentBotId;
    const projectId = context.projectId || parentState.projectId;
    const requestId = context.requestId || parentState.requestId;
    const token = context.token || parentState.token;
    const tdcache = context.tdcache;

    const request_botId_key = 'tilebot:botId_requests:' + requestId;
    await tdcache.set(request_botId_key, parentBotId, { EX: 604800 });

    let botsDS;
    if (staticBots) {
      botsDS = new MockBotsDataSource(staticBots);
    } else {
      botsDS = new MongodbBotsDataSource({ projectId: projectId, botId: parentBotId });
    }

    const bot = await botsDS.getBotByIdCache(parentBotId, tdcache).catch((err) => {
      return Promise.reject(err);
    });

    let intentsMachine;
    let backupMachine;
    if (!staticBots) {
      intentsMachine = IntentsMachineFactory.getMachine(bot, parentBotId, projectId);
      backupMachine = IntentsMachineFactory.getBackupMachine(bot, parentBotId, projectId);
    } else {
      intentsMachine = {};
    }

    const chatbot = new TiledeskChatbot({
      botsDataSource: botsDS,
      intentsFinder: intentsMachine,
      backupIntentsFinder: backupMachine,
      botId: parentBotId,
      bot: bot,
      token: token,
      APIURL: context.API_ENDPOINT,
      APIKEY: '___',
      tdcache: tdcache,
      requestId: requestId,
      projectId: projectId,
      MAX_STEPS: MAX_STEPS,
      MAX_EXECUTION_TIME: MAX_EXECUTION_TIME
    });

    const supportRequest = {
      request_id: requestId,
      id_project: projectId,
      bot_id: parentBotId,
      draft: parentState.supportRequest?.draft,
      department: parentState.supportRequest?.department
    };

    winston.info(
      '(Subagent) RESUME inline requestId=' + requestId +
      ' parentBotId=' + parentBotId +
      ' resumeIndex=' + parentState.resumeIndex
    );

    const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');

    const directivesPlug = new DirectivesChatbotPlug({
      message: parentState.message,
      reply: parentState.reply,
      directives: parentState.directives,
      chatbot: chatbot,
      supportRequest: supportRequest,
      API_ENDPOINT: context.API_ENDPOINT,
      TILEBOT_ENDPOINT: context.TILEBOT_ENDPOINT,
      token: token,
      cache: tdcache,
      resumeIndex: parentState.resumeIndex,
      HELP_CENTER_API_ENDPOINT: context.HELP_CENTER_API_ENDPOINT
    });

    await new Promise((resolve, reject) => {
      try {
        directivesPlug.processDirectives(() => {
          winston.verbose('(SubagentResumeService) Parent flow resumed.');
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

}

module.exports = SubagentResumeService;
