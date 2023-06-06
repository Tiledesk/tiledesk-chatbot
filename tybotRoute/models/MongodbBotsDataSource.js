let Faq = require('./faq');
let Faq_kb = require('./faq_kb');

class MongodbBotsDataSource {

  constructor(config) {
    if (!config.projectId) {
      throw new Error("config.projectId is mandatory");
    }
    this.projectId = config.projectId;
    this.log = config.log;
  }
  
  async getBotById(botId) {
    const bot = await Faq_kb.findById(botId).select('+secret').exec();
    if (bot) {
      return bot;
    }
    return null;
  }

  async getBotByIdCache(botId, tdcache) {
    let bot = null;
    if (tdcache) {
      let botCacheKey = "cacheman:cachegoose-cache:faq_kbs:id:" + botId;
      try {
        let _bot_as_string = await tdcache.get(botCacheKey);
        const value_type = typeof _bot_as_string;
        if (this.log) {
          console.log("__bot_as_string found in chache:", _bot_as_string);
          console.log("value_type:", value_type);
        }
        if (_bot_as_string) {
          bot = JSON.parse(_bot_as_string);
          if (this.log) {
            console.log("got bot from cache:", JSON.stringify(bot));
          }
        }
        else {
          if (this.log) {
            console.log("bot not found, getting from datasource...");
          }
          bot = await this.getBotById(botId);
          if (this.log) {
            console.log("bot found in datasource:", JSON.stringify(bot));
          }
          await tdcache.set(botCacheKey, JSON.stringify(bot));
          // DEBUG CODE REMOVE
          // let bot_ = await tdcache.get(botCacheKey);
          // console.log("_bot_as_string from cache debug:", bot_)
        }
      }
      catch(err) {
        console.error("error getting bot by id:", err);
      }
    }
    else {
      if (this.log) {
        console.log("no chache. getting bot from datasource...");
      }
      bot = await this.getBotById(botId);
      if (this.log) {
        console.log("bot found in datasource:", JSON.stringify(bot));
      }
    }
    return bot;
  }

  /**
   * 
   * @param {String} text 
   * @returns an Array of matches
   */
  async getByExactMatch(botId, text) {
    // SEARCH INTENTS
    return new Promise( (resolve, reject) => {
      // let query = { "id_project": this.projectId, "id_faq_kb": botId, "question": text };
      let query = { "id_faq_kb": botId, "question": text };
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
  async getByIntentDisplayName(botId, key) {
    if (this.log) {console.log("Quering intent by botId:", botId, "key:", key );}
    return new Promise((resolve, reject) => {
      // var query = { "id_project": this.projectId, "id_faq_kb": botId, "intent_display_name": name};
      let query = null;
      key = key.trim();
      if (key.startsWith("#")) {
        let intent_id = key.substring(key.indexOf("#") + 1);
        if (this.log) {console.log("Query by intent_id:", intent_id );}
        query = { "id_faq_kb": botId, "intent_id": intent_id };
      }
      else {
        if (this.log) {console.log("Query by intent name:", key);}
        query = { "id_faq_kb": botId, "intent_display_name": key };
      }      
      if (this.log) {console.debug('query', query);}
      Faq.find(query).lean().exec( (err, faqs) => {
        if (err) {
          console.error("error getting faqs", err);
          return reject(err);
        }
        if (this.log) {console.debug("getByIntentDisplayName faqs", JSON.stringify(faqs));}
        if (faqs && faqs.length > 0) {
          const intent = faqs[0];
          if (this.log) {console.debug("intent found:", JSON.stringify(intent));}
          return resolve(intent);
        }
        else {
          if (this.log) {console.debug("No intent found");}
          return resolve(null);
        }
      });
    });
  }

  async getByIntentDisplayNameCache(botId, key, tdcache) {
    let faq = null;
    if (this.log) {
      console.log("botID: -" + botId + "-");
      console.log("key: -" + key + "-");
    }
    if (tdcache) {
      if (this.log) {console.log("in tdcache");}
      let faqCacheKey = "cacheman:cachegoose-cache:faqs:botid:"+ botId + ":faq:id:" + key;
      if (this.log) {console.log("Looking in cache for: -" + faqCacheKey + "-");}
      try {
        let _faq_as_string = await tdcache.get(faqCacheKey);
        const value_type = typeof _faq_as_string;
        if (this.log) {
          console.log("_faq_as_string found in chache:", _faq_as_string);
          console.log("value_type:", value_type);
        }
        if (_faq_as_string) {
          faq = JSON.parse(_faq_as_string);
          if (this.log) {console.log("got faq from cache:", JSON.stringify(faq));}
        }
        else {
          //console.log("faq not found, getting from datasource...");
          faq = await this.getByIntentDisplayName(botId, key);
          if (this.log) {console.log(".faq found in datasource:", JSON.stringify(faq));}
          await tdcache.set(
            faqCacheKey,
            JSON.stringify(faq),
            {EX: 86400} // 1 day
          );
          // DEBUG CODE REMOVE
          // let faq_ = await tdcache.get(faqCacheKey);
          // console.log("_faq_as_string from cache debug:", faq_)
        }
      }
      catch(err) {
        console.error("error getting faq by id:", err);
      }
    }
    else {
      if (this.log) {console.log("no chache. getting faq from datasource...");}
      faq = await this.getByIntentDisplayName(botId, key);
      if (this.log) {console.log("faq found in datasource (no-cache):", JSON.stringify(faq));}
    }
    return faq;
  }

  // query = { "id_project": message.id_project, "id_faq_kb": faq_kb._id,  $or:[{"intent_id": action}, {"intent_display_name": action}]};
  
}

module.exports = { MongodbBotsDataSource }