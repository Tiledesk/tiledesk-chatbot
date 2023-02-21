class IntentsMachineFactory {

    static getMachine(bot) {
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