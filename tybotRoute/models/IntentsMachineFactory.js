const { MongodbIntentsMachine } = require('./MongodbIntentsMachine.js');

class IntentsMachineFactory {

    static getMachine(bot, botId, projectId, log) {
      let machine;
      console.log("=====================>"+bot.intentsEngine)
      if (bot.intentsEngine === "tiledesk-ai") {
        machine = new TiledeskIntentsMachine(
          {
            botId: botId
          });
      }
      else {
        if (log) {console.log("Setting MongodbIntentsMachine with bot:", JSON.stringify(bot));}
        machine = new MongodbIntentsMachine({projectId: projectId, language: bot.language, log});
      }
      return machine;
    }
  }
  
  module.exports = { IntentsMachineFactory }