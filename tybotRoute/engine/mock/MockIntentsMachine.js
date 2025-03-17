class MockIntentsMachine {

  constructor(bots) {
    if (!bots) {
      throw new Error("bots is mandatory")
    }
    this.data = bots;
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

module.exports = { MockIntentsMachine }