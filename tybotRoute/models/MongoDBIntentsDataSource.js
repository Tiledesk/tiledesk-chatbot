class StaticIntentsQueryAdapter {

  constructor() {
  }
  
  async getByExactMatch(text) {
    const intent_display_name = questions_intent[text];
    if (intent_display_name) {
      return intents[intent_display_name];
    }
    return null;
  }

  async getIntentByDisplayName(name, bot) {
    return new Promise((resolve, reject) => {
      var query = { "id_project": bot.id_project, "id_faq_kb": bot._id, "intent_display_name": name};
      if (this.log) {console.debug('query', query);}
      Faq.find(query).lean().exec( (err, faqs) => {
        if (err) {
          return reject(err);
        }
        if (this.log) {console.debug("faqs", faqs);}
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