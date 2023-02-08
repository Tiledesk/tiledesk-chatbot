var Faq_kb = require("./faq_kb");

class FaqKbService {

  async getAll(_query) {
    let query = _query;
    if (!query) {
      query = {
        public: true,
        certified: true,
        "trashed": { $in: [null, false] }
      }
    }
    var sortQuery = {};
    sortQuery["score"] = -1;
    console.log("(Service) GET ALL FAQ_KBs");
    return new Promise((resolve, reject) => {
      // let query = {public: options.public, certified: options.certified};
      Faq_kb.find(query).sort(sortQuery).lean().exec( (err, bots) => {
        if (err) {
          reject(err);
        }
        resolve(bots);
      });
    });
  }

}

var faqKbService = new FaqKbService();
module.exports = faqKbService;
