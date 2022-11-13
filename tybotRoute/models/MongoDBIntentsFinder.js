let mongoose = require('mongoose');

class MongoDBIntentsFinder {

  constructor() {
  }

  /**
   * intentsFinder Adapter
   * @param {String} text 
   * @returns the matching intents' names array
   */
  async decode(text) {
    if (this.log) {console.log("NLP decode intent...");}
      query = { "id_project": this.projectId, "id_faq_kb": this.botId };
      var mongoproject = undefined;
      var sort = undefined;
      var search_obj = { "$search": message.text };

      if (this.faq_kb.language) {
          search_obj["$language"] = this.faq_kb.language;
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
          let reply = await this.execIntent(faqs, this.botId, message, bot);
          resolve(reply);
        }
        else {
          // fallback
          const fallbackIntent = await this.getIntentByDisplayName("defaultFallback", bot);
          const faqs = [fallbackIntent];
          let reply = await this.execIntent(faqs, this.botId, message, bot);
          resolve(reply); // bot_token
        }
      });
  }
  
}

module.exports = { MongoDBIntentsFinder }