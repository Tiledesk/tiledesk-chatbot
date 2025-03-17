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
    return new Promise((resolve, reject)=>{
      try{
        const bot = {
          webhook_enabled: this.data.bots[botId].webhook_enabled,
          webhook_url: this.data.bots[botId].webhook_url,
          language: this.data.bots[botId].language,
          name: this.data.bots[botId].name
        }
        resolve(bot)
      }catch(err){
        reject(err);
      }
    })
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
    let intent;
    try {
      let key = intentName.trim();
      if (key.startsWith("#")) {
        let intent_id = key.substring(key.indexOf("#") + 1);
        intent = this.data.bots[botId].intents_by_intent_id[intent_id];
      }
      else {
        let intent_id = key;
        intent = this.data.bots[botId].intents[intent_id];
      }
    }
    catch(err) {
      winston.error("(MockBotsDataSource) Error getByIntentDisplayName: ", err);
    }
    return intent;
  }

  async getByIntentDisplayNameCache(botId, key, tdcache) {
    let faq = null;
    if (tdcache) {
      faq = await this.getByIntentDisplayName(botId, key);
    }
    else {
      faq = await this.getByIntentDisplayName(botId, key);
    }
    
    // clones the faq to avoid modifying original object
    let json_faq;
    if (faq !== null && faq !== undefined) {
      let string_faq = JSON.stringify(faq)
      json_faq = JSON.parse(string_faq);
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