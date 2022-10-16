let Faq = require('./models/faq');
let Faq_kb = require('./models/faq_kb');

class Chatbot {
  
  find(text, callback) {
    return new Promise( (resolve, reject) => {
      
    });
  }

  getIntentByDisplayName(name, bot) {
    return new Promise(function(resolve, reject) {
      var query = { "id_project": bot.id_project, "id_faq_kb": bot._id, "intent_display_name": name};
      if (log) {console.debug('query', query);}
      Faq.find(query).lean().exec(function (err, faqs) {
        if (err) {
          return reject();
        }
        if (log) {console.debug("faqs", faqs);}
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

modeule.exports = { Chatbot };