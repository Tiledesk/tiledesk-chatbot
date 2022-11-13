class MockBotsDataSource {

  constructor(bots, intents) {
    if (intents) {
      this.data = intents;
    }
    if (bots) {
      this.bots = bots;
    }
  }
  
  // let faqs = await this.intentsDataSource.getByExactMatch(message.text);
  // let faq = await this.intentsDataSource.getByIntentDisplayName(display_name);
  // let intents = await this.intentsFinder.find(message.text);

  async getBotById(botId) {
    const bot = this.bots[botId];
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
  async getByExactMatch(text) {
    const intent_display_name = this.data.questions_intent[text];
    if (intent_display_name) {
      return [this.data.intents[intent_display_name]];
    }
    return null;
  }

  /**
   * 
   * @param {String} intentName
   * @returns a single Intent
   */
  async getByIntentDisplayName(intentName) {
    return this.data.intents[intentName];
  }

  /**
   * intentsFinder Adapter
   * @param {String} text 
   * @returns the matching intents' names array
   */
   async decode(text) {
    if (this.data.intents_nlp[text]) {
      return [ this.data.intents_nlp[text] ];
    }
    else {
      return [];
    }
  }
  
}

module.exports = { MockBotsDataSource }