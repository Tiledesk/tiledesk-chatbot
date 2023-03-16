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
    const bot = {
      webhook_enabled: this.data.bots[botId].webhook_enabled,
      language: this.data.bots[botId].language,
      name: this.data.bots[botId].name
    }
    if (bot) {
      return bot;
    }
    return null;
  }
  
  async getBotByIdCache(botId, tdcache) {
    return this.getBotById(botId);
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
    // console.log("this.data_", JSON.stringify(this.data.bots[botId]))
    const intent = this.data.bots[botId].intents[intentName];
    // console.log("got intent:", intent);
    return intent;
  }

  async getByIntentDisplayNameCache(botId, key, tdcache) {
    let faq = null;
    if (tdcache) {
      // console.log("mock chache. anyway in mock getting faq from datasource...");
      faq = await this.getByIntentDisplayName(botId, key);
      // console.log("faq found in datasource.:", JSON.stringify(faq));
    }
    else {
      // console.log("mock no chache. getting faq from datasource...");
      faq = await this.getByIntentDisplayName(botId, key);
      // console.log("faq found in datasource..:", JSON.stringify(faq));
    }
    // clones the faq to avoid modifying original object
    // console.log("faq is:", faq)
    let json_faq;
    if (faq !== null && faq !== undefined) {
      let string_faq = JSON.stringify(faq)
      // console.log("string faq is:", string_faq)
      json_faq = JSON.parse(string_faq);
      // console.log("json faq is:", json_faq)
    }
    return json_faq;
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