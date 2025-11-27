let Faq = require('../models/faq');
let Faq_kb = require('../models/faq_kb');
const winston = require('../utils/winston');

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

  async getBotByIdCache(botId, tdcache) {
    let bot = null;
    if (tdcache) {
      let botCacheKey = "cacheman:cachegoose-cache:faq_kbs:id:" + botId;
      try {
        let _bot_as_string = await tdcache.get(botCacheKey);
        const value_type = typeof _bot_as_string;
        winston.debug("(MongodbBotsDataSource) _bot_as_string found in chache: " + _bot_as_string);
        winston.debug("(MongodbBotsDataSource) value_type: " + value_type);
        if (_bot_as_string) {
          console.log("Cache HIT")
          bot = JSON.parse(_bot_as_string);
          winston.debug("(MongodbBotsDataSource) got bot from cache: ", bot);
        }
        else {
          console.log("Cache MISS")
          winston.debug("(MongodbBotsDataSource) bot not found, getting from datasource...");
          bot = await this.getBotById(botId);
          winston.debug("(MongodbBotsDataSource) bot found in datasource: ", bot);
          await tdcache.set(botCacheKey, JSON.stringify(bot));
          // DEBUG CODE REMOVE
          // let bot_ = await tdcache.get(botCacheKey);
        }
      }
      catch(err) {
        winston.error("(MongodbBotsDataSource) Error getting bot by id: ", err);
      }
    }
    else {
      winston.verbose("(MongodbBotsDataSource) No chache. getting bot from datasource...");
      bot = await this.getBotById(botId);
      winston.debug("(MongodbBotsDataSource) bot found in datasource: ", bot);
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
          winston.error("(MongodbBotsDataSource) Error getting faq object: ", err);
          reject(err);
        }
        else if (faqs && faqs.length > 0 && faqs[0].answer) {
          winston.debug("(MongodbBotsDataSource) Exact match or action Faq: ", faqs);
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
    winston.debug("(MongodbBotsDataSource) Quering intent by botId: " + botId + " key: " + key );
    return new Promise((resolve, reject) => {
      // var query = { "id_project": this.projectId, "id_faq_kb": botId, "intent_display_name": name};
      let query = null;
      key = key.trim();
      if (key.startsWith("#")) {
        let intent_id = key.substring(key.indexOf("#") + 1);
        winston.debug("(MongodbBotsDataSource)Query by intent_id: " + intent_id );
        query = { "id_faq_kb": botId, "intent_id": intent_id };
      }
      else {
        winston.debug("(MongodbBotsDataSource) Query by intent name: " + key);
        query = { "id_faq_kb": botId, "intent_display_name": key };
      }      
      winston.debug("(MongodbBotsDataSource) query", query);
      Faq.find(query).lean().exec( (err, faqs) => {
        if (err) {
          winston.error("(MongodbBotsDataSource) Error getting faqs ", err);
          return reject(err);
        }
        winston.debug("(MongodbBotsDataSource) getByIntentDisplayName faqs ", faqs);
        if (faqs && faqs.length > 0) {
          const intent = faqs[0];
          winston.debug("(MongodbBotsDataSource) intent found: ", intent);
          return resolve(intent);
        }
        else {
          winston.verbose("(MongodbBotsDataSource) No intent found");
          return resolve(null);
        }
      });
    });
  }

  async getByIntentDisplayNameCache(botId, key, tdcache) {
    let faq = null;
    winston.verbose("(MongodbBotsDataSource) botID: -" + botId + "-");
    winston.verbose("(MongodbBotsDataSource) key: -" + key + "-");
    if (tdcache) {
      let faqCacheKey = "cacheman:cachegoose-cache:faqs:botid:"+ botId + ":faq:id:" + key;
      winston.debug("(MongodbBotsDataSource) Looking in cache for: -" + faqCacheKey + "-");
      try {
        let _faq_as_string = await tdcache.get(faqCacheKey);
        const value_type = typeof _faq_as_string;
        winston.debug("(MongodbBotsDataSource)_faq_as_string found in chache: " + _faq_as_string);
        winston.debug("(MongodbBotsDataSource)value_type: " + value_type);
        if (_faq_as_string) {
          faq = JSON.parse(_faq_as_string);
          winston.debug("(MongodbBotsDataSource) Got faq from cache: ", faq);
        }
        else {
          faq = await this.getByIntentDisplayName(botId, key);
          winston.debug("(MongodbBotsDataSource) faq found in datasource:", faq);
          await tdcache.set(
            faqCacheKey,
            JSON.stringify(faq),
            {EX: 86400} // 1 day
          );
          // DEBUG CODE REMOVE
          // let faq_ = await tdcache.get(faqCacheKey);
        }
      }
      catch(err) {
        winston.error("(MongodbBotsDataSource) Error getting faq by id: ", err);
      }
    }
    else {
      winston.debug("(MongodbBotsDataSource) No chache. Getting faq from datasource...");
      faq = await this.getByIntentDisplayName(botId, key);
      winston.debug("(MongodbBotsDataSource) Faq found in datasource (no-cache): ", faq);
    }
    return faq;
  }

  // query = { "id_project": message.id_project, "id_faq_kb": faq_kb._id,  $or:[{"intent_id": action}, {"intent_display_name": action}]};
  
}

module.exports = { MongodbBotsDataSource }