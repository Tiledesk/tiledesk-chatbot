const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
let Faq_kb = require('../tybotRoute/models/faq_kb');
let faqService = require('../tybotRoute/models/faqService');
let templates = require('./templates.json');

router.get('/', (req, res) => {
  res.send('Hello Chatbot Templates!');
});

router.get('/public/templates', (req, res) => {
  res.send(templates);
});

router.get('/public/templates/:botid', (req, res) => {
  let id_faq_kb = req.params.botid;
  Faq_kb.findById(id_faq_kb, async (err, faq_kb) => {
    console.log('FAQ-KB: ', faq_kb);
    if (err) {
      console.error('GET FAQ-KB ERROR ', err)
      return res.status(500).send({ success: false, msg: 'Error getting bot.' });
    } else if (faq_kb.public) {
      let faqs = null;
      try {
        faqs = await faqService.getAll(id_faq_kb); //.then((faqs) => {
        const intents = faqs.map(({_id, id_project, topic, status, id_faq_kb, createdBy, intent_id, createdAt, updatedAt, __v, ...keepAttrs}) => keepAttrs)
        let json = {
          webhook_enabled: faq_kb.webhook_enabled,
          webhook_url: faq_kb.webhook_url,
          language: faq_kb.language,
          name: faq_kb.name,
          description: faq_kb.description,
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
      res.status(403).send({success: false, message: "Forbidden"});
    }
  })
});

module.exports = { router: router};