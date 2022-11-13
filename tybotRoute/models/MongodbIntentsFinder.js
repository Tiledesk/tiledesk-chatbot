let mongoose = require('mongoose');
let Faq = require('./faq');

class MongodbIntentsFinder {

  constructor(config) {
    if (!config.projectId) {
      throw new Error("config.projectId is mandatory");
    }
    if (!config.botId) {
      throw new Error("config.botId is mandatory");
    }
    this.projectId = config.projectId;
    this.botId = config.botId;
    this.language = config.language;
  }

  /**
   * intentsFinder Adapter
   * @param {String} text 
   * @returns the matching intents' names array
   */
  async decode(text) {
    if (this.log) {console.log("NLP decode intent...");}
      let query = { "id_project": this.projectId, "id_faq_kb": this.bot._id };
      var mongoproject = undefined;
      var sort = undefined;
      var search_obj = { "$search": text };

      if (this.language) {
          search_obj["$language"] = this.language;
      }
      query.$text = search_obj;
      //console.debug("fulltext search query", query);

      mongoproject = { score: { $meta: "textScore" } };
      sort = { score: { $meta: "textScore" } } 
      // DA QUI RECUPERO LA RISPOSTA DATO (ID: SE EXT_AI) (QUERY FULLTEXT SE NATIVE-BASIC-AI)
      Faq.find(query, mongoproject).sort(sort).lean().exec(async (err, faqs) => {
        if (this.log) {console.log("Found:", faqs);}
        if (err) {
          console.error("Error:", err);
        }
        if (faqs && faqs.length > 0 && faqs[0].answer) {
          resolve(faqs);
        }
        else {
          // fallback
          //const fallbackIntent = await this.getIntentByDisplayName("defaultFallback", bot);
          //const faqs = [fallbackIntent];
          resolve([]);
        }
      });
  }
  
}

module.exports = { MongodbIntentsFinder }