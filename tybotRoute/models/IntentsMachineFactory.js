const { MongodbIntentsMachine } = require('./MongodbIntentsMachine.js');

class IntentsMachineFactory {

    static getMachine(bot, botId, projectId, log) {
      let machine;
      if (bot.intentsEngine === "tiledesk-ai") {
        machine = new TiledeskIntentsMachine(
          {
            botId: botId
          });
      }
      else {
        machine = new MongodbIntentsMachine({projectId: projectId, language: bot.language, log});
      }
      return machine;
    }
  }
  
  module.exports = { IntentsMachineFactory }