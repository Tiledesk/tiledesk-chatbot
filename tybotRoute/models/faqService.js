var Faq = require("./faq");
var Faq_kb = require("./faq_kb");

class FaqService {

  getAll(faq_kb_id) {
    console.log("(Service) GET ALL FAQ OF THE BOT ID (req.query): ", faq_kb_id);
    return new Promise((resolve, reject) => {
      Faq.find({ id_faq_kb: faq_kb_id}, (err, faqs) => {
        if (err) {
          reject(err);
        }
        resolve(faqs);
      });//.lean().exec()
    })
  }

}

var faqService = new FaqService();
module.exports = faqService;
