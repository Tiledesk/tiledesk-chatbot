let Faq = require('./faq');
let Faq_kb = require('./faq_kb');

class MongodbBotsDataSource {

  constructor(config) {
    if (!config.projectId) {
      throw new Error("config.projectId is mandatory");
    }
    this.projectId = config.projectId;
  }
  
  async getBotById(botId) {
    const bot = await Faq_kb.findById(botId).select('+secret').exec();
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
    // SEARCH INTENTS
    return new Promise( (resolve, reject) => {
      let query = { "id_project": this.projectId, "id_faq_kb": botId, "question": text };
      Faq.find(query).lean().exec(async (err, faqs) => {
        if (err) {
          console.error("Error getting faq object.", err);
          reject(err);
        }
        else if (faqs && faqs.length > 0 && faqs[0].answer) {
          if (this.log) {console.log("EXACT MATCH OR ACTION FAQ:", faqs);}
          resolve(faqs);
        }
        else {
          resolve(null);
        }
      });
    });
  }

  /**
   * 
   * @param {String} intentName
   * @returns a single Intent
   */
  async getByIntentDisplayName(botId, name) {
    return new Promise((resolve, reject) => {
      var query = { "id_project": this.projectId, "id_faq_kb": botId, "intent_display_name": name};
      if (this.log) {console.debug('query', query);}
      Faq.find(query).lean().exec( (err, faqs) => {
        if (err) {
          return reject(err);
        }
        if (this.log) {console.debug("getByIntentDisplayName faqs", faqs);}
        if (faqs && faqs.length > 0) {
          const intent = faqs[0];
          return resolve(intent);
        }
        else {
          return resolve(null);
        }
      });
    });
  }
  
}

module.exports = { MongodbBotsDataSource }