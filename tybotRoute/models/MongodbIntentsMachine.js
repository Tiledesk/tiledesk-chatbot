let mongoose = require('mongoose');
let Faq = require('./faq');

class MongodbIntentsMachine {

  constructor(config) {
    if (!config.projectId) {
      throw new Error("config.projectId is mandatory");
    }
    this.projectId = config.projectId;
    this.language = config.language;
    this.log = config.log;
  }

  /**
   * intentsFinder Adapter
   * @param {String} text 
   * @returns the matching intents' names array
   */
  async decode(botId, text) {
    return new Promise( (resolve, reject) => {
      if (this.log) {console.log("Mongodb NLP decode intent...");}
      // let query = { "id_project": this.projectId, "id_faq_kb": botId };
      let query = { "id_faq_kb": botId };
      var mongoproject = undefined;
      var sort = undefined;
      var search_obj = { "$search": text };
  
      if (this.language) {
          search_obj["$language"] = this.language;
      }
      query.$text = search_obj;
      mongoproject = { score: { $meta: "textScore" } };
      sort = { score: { $meta: "textScore" } } 
      // DA QUI RECUPERO LA RISPOSTA DATO (ID: SE EXT_AI) (QUERY FULLTEXT SE NATIVE-BASIC-AI)
      Faq.find(query, mongoproject).sort(sort).lean().exec( (err, faqs) => {
        if (this.log) {console.log("Found:", faqs);}
        if (err) {
          console.error("Error:", err);
        }
        if (faqs && faqs.length > 0) {
          resolve(faqs);
        }
        else {
          // fallback
          //const fallbackIntent = await this.getIntentByDisplayName("defaultFallback", bot);
          //const faqs = [fallbackIntent];
          resolve([]);
        }
      });
    })
  }
  
}

module.exports = { MongodbIntentsMachine }