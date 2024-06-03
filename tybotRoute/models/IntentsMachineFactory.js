const { MongodbIntentsMachine } = require('./MongodbIntentsMachine.js');
const { TiledeskIntentsMachine } = require("./TiledeskIntentsMachine.js");

class IntentsMachineFactory {

    static getMachine(bot, botId, projectId, log) {
      let machine;
      if (bot && bot.intentsEngine === "tiledesk-ai") {
        console.log("bot.intentsEngine is tiledesk-ai");
        machine = new TiledeskIntentsMachine(
          {
            botId: botId
          });
      }
      else if (bot) {
        if (log) {console.log("Setting MongodbIntentsMachine with bot:", JSON.stringify(bot));}
        machine = new MongodbIntentsMachine({projectId: projectId, language: bot.language, log});
      }
      else {
        console.error("bot is null for:", botId, "on projectId:", projectId);
      }
      return machine;
    }

    static getBackupMachine(bot, botId, projectId, log) {
      let machine;
      if (log) {console.log("Setting MongodbIntentsMachine as Backup Intents Machine on bot:", JSON.stringify(bot));}
      machine = new MongodbIntentsMachine({projectId: projectId, language: bot.language, log});
      return machine;
    }
  }
  
  module.exports = { IntentsMachineFactory }