class MockBotsDataSource {

  constructor(bots) {
    if (!bots) {
      throw new Error("bots is mandatory")
    }
    this.data = bots;
  }
  
  // let faqs = await this.intentsDataSource.getByExactMatch(message.text);
  // let faq = await this.intentsDataSource.getByIntentDisplayName(display_name);
  // let intents = await this.intentsFinder.find(message.text);

  async getBotById(botId) {
    const bot = this.data.bots[botId];
    if (bot) {
      return bot;
    }
    return null;
  }

  /**
   * 
   * @param {String} text 
   * @returns an Array of matches
   */
  async getByExactMatch(botId, text) {
    const intent_display_name = this.data.bots[botId].questions_intent[text];
    if (intent_display_name) {
      return [this.data.bots[botId].intents[intent_display_name]];
    }
    return null;
  }

  /**
   * 
   * @param {String} intentName
   * @returns a single Intent
   */
  async getByIntentDisplayName(botId, intentName) {
    const intent = this.data.bots[botId].intents[intentName];
    return intent;
  }

  /**
   * intentsFinder Adapter
   * @param {String} text 
   * @returns the matching intents' names array
   */
   async decode(botId, text) {
    if (this.data.bots[botId].intents_nlp[text]) {
      return [ this.data.bots[botId].intents_nlp[text] ];
    }
    else {
      return [];
    }
  }

  /**
   * intentsFinder Adapter
   * @param {String} botId
   * @param {Object} json
   * @returns true if the train task started
   */
   async train(botId, json) {
    if (!this.data) {
      throw new Error("Can't train empty data");
    }
    return true
  }
  
}

module.exports = { MockBotsDataSource }