const { MongodbIntentsMachine } = require('./MongodbIntentsMachine.js');
const { TiledeskIntentsMachine } = require("./TiledeskIntentsMachine.js");

class IntentsMachineFactory {

    static getMachine(bot, botId, projectId, log) {
      let machine;
      if (bot.intentsEngine === "tiledesk-ai") {
        console.log("bot.intentsEngine is tiledesk-ai");
        machine = new TiledeskIntentsMachine(
          {
            botId: botId
          });
      }
      else {
        console.log("bot.intentsEngine is null");
        if (log) {console.log("Setting MongodbIntentsMachine with bot:", JSON.stringify(bot));}
        machine = new MongodbIntentsMachine({projectId: projectId, language: bot.language, log});
      }
      return machine;
    }
  }
  
  module.exports = { IntentsMachineFactory }