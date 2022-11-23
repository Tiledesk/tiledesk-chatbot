var Faq = require("./faq");
var Faq_kb = require("./faq_kb");

class FaqService {

  async getAll(faq_kb_id) {
    console.log("(Service) GET ALL FAQ OF THE BOT ID (req.query): ", faq_kb_id);
    return new Promise((resolve, reject) => {
      let query = { id_faq_kb: faq_kb_id};
      Faq.find(query).lean().exec( (err, faqs) => {
        if (err) {
          reject(err);
        }
        resolve(faqs);
      });
    })
  }

}

var faqService = new FaqService();
module.exports = faqService;
