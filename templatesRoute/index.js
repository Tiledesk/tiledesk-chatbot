const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
let Faq_kb = require('../tybotRoute/models/faq_kb');
let faqService = require('../tybotRoute/models/faqService');
let faqKbService = require('../tybotRoute/models/faqKbService');

router.get('/', (req, res) => {
  res.send('Hello Chatbot Templates!');
});

router.get('/public/community', async (req, res) => {
  let bots = [];
  let query = {public: true, certified: false};
  try {
    bots = await faqKbService.getAll(query);
    res.send(bots);
  }
  catch (err) {
    console.error('Get Bots Error ', err);
    return res.status(500).send({ success: false, msg: 'Error getting bots.' });
  }
});

router.get('/public/templates', async (req, res) => {
  let bots = [];
  let query = {public: true, certified: true};
  try {
    bots = await faqKbService.getAll(query);
    res.send(bots);
  }
  catch (err) {
    console.error('GET FAQ-KBs ERROR ', err);
    return res.status(500).send({ success: false, msg: 'Error getting bots.' });
  }
});

// router.get('/public/community/system/:mainCategory', async (req, res) => {
//   let bots = [];
//   let query = {public: true, certified: true};
//   try {
//     bots = await faqKbService.getAll(query);
//     let botId = publicBotByCategory(bots, mainCategory);
//   }
//   catch (err) {
//     console.error('GET FAQ-KBs ERROR ', err);
//     return res.status(500).send({ success: false, msg: 'Error getting bots.' });
//   }
// });

router.get('/public/templates/:botid', (req, res) => {
  let id_faq_kb = req.params.botid;
  Faq_kb.findById(id_faq_kb, async (err, faq_kb) => {
    console.log('FAQ-KB: ', faq_kb);
    if (err) {
      console.error('GET FAQ-KB ERROR ', err)
      return res.status(500).send({ success: false, msg: 'Error getting bot.' });
    }
    else if (!faq_kb) {
      return res.status(404).send({ success: false, msg: 'Not found.' });
    }
    else if (faq_kb["public"]) {
      console.log("public chatbot");
      console.log('public: ', faq_kb["public"]);
      console.log('webhook_enabled', faq_kb["webhook_enabled"]);
      console.log('type', faq_kb["type"]);
      console.log('language', faq_kb["language"]);
      console.log('name', faq_kb["name"]);
      console.log('id_project', faq_kb["id_project"]);
      console.log('trashed', faq_kb["trashed"]);
      let faqs = null;
      try {
        faqs = await faqService.getAll(id_faq_kb); //.then((faqs) => {
        const intents = faqs.map(({_id, id_project, topic, status, id_faq_kb, createdBy, intent_id, createdAt, updatedAt, __v, ...keepAttrs}) => keepAttrs)
        let json = {
          webhook_enabled: faq_kb.webhook_enabled,
          webhook_url: faq_kb.webhook_url,
          language: faq_kb.language,
          name: faq_kb.name,
          type: faq_kb.type,
          description: faq_kb.description,
          mainCategory: faq_kb.mainCategory,
          attributes: faq_kb.attributes,
          intents: intents
        }
        return res.send(json);
      }
      catch(err) {
        console.error('GET FAQ ERROR: ', err)
        return res.status(500).send({ success: false, msg: 'Error getting faqs.' });
      }
    }
    else {
      console.log("private chatbot");
      res.status(403).send({success: false, message: "Forbidden"});
    }
  })
});

router.get('/public/templates/windows/:botid', (req, res) => {
  let id_faq_kb = req.params.botid;
  Faq_kb.findById(id_faq_kb, async (err, faq_kb) => {
    console.log('FAQ-KB: ', faq_kb);
    if (err) {
      console.error('GET FAQ-KB ERROR ', err)
      return res.status(500).send({ success: false, msg: 'Error getting bot.' });
    }
    else if (!faq_kb) {
      return res.status(404).send({ success: false, msg: 'Not found.' });
    }
    else if (faq_kb["public"]) {
      let json = {
        language: faq_kb.language,
        name: faq_kb.name,
        type: faq_kb.type,
        description: faq_kb.description,
        tags: faq_kb.tags,
        bigImage: faq_kb.bigImage,
        mainCategory: faq_kb.mainCategory,
        attributes: faq_kb.attributes,
        templateFeatures: faq_kb.templateFeatures
      }
      return res.send(json);
    }
    else {
      console.log("private chatbot");
      res.status(403).send({success: false, message: "Forbidden"});
    }
  })
});

// function publicBotByCategory(bots, category) {
//   if (!bots || bots.length == 0) {
//     console.error("Error: Bots are empty. Can't find by category");
//     return null;
//   }
//   for (let i = 0; i < bots.length; i++)  {
//     let bot = bots[i];
//     console.log('Bot: ', JSON.stringify(bot));
//     if (bot.mainCategory === category) {
//       return bot._id;
//     }
//   }
//   return null;
// }

module.exports = { router: router};