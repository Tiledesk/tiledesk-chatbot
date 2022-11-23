const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
let Faq_kb = require('../tybotRoute/models/faq_kb');
let faqService = require('../tybotRoute/models/faqService');

router.get('/', (req, res) => {
  res.send('Hello Chatbot Templates!');
});

router.get('/public/templates', (req, res) => {
  console.log("REQUEST BODY:", JSON.stringify(req.body));
  const text = req.body.text;
  console.log("query text:", text);
  const botId = req.body.botId;
  console.log("query botId:", botId);
  res.send(
    [
      {
        "name": "blank",
        botId: "635b982a448a230012464b13",
        description: "Start design your chatbot from a blank template",
        icon: "https://firebasestorage.googleapis.com/v0/b/tiledesk-prod-v2.appspot.com/o/profiles%2F635b982a448a230012464b13%2Fphoto.jpg?alt=media&1669186993792"
      },
      {
        "name": "handoff",
        botId: "635b982a448a230012464b13",
        description: "The chatbot greets and supports, switch to a human agent when needed",
        icon: "https://firebasestorage.googleapis.com/v0/b/tiledesk-prod-v2.appspot.com/o/profiles%2F635b982a448a230012464b13%2Fphoto.jpg?alt=media&1669186993792"
      },
      {
        name: "Quick replies",
        botId: "635b982a448a230012464b13",
        description: "Dynamic quick replies chatbot",
        icon: "https://firebasestorage.googleapis.com/v0/b/tiledesk-prod-v2.appspot.com/o/profiles%2F635b982a448a230012464b13%2Fphoto.jpg?alt=media&1669186993792"
      }
    ]
  );
});

router.get('/public/templates/:botid', (req, res) => {
  let id_faq_kb = req.params.botid;
  Faq_kb.findById(id_faq_kb, (err, faq_kb) => {
    if (err){
      console.error('GET FAQ-KB ERROR ', err)
      return res.status(500).send({ success: false, msg: 'Error getting bot.' });
    } else {
      console.log('FAQ-KB: ', faq_kb)

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
      catch((err) => {
        console.error('GET FAQ ERROR: ', err)
        return res.status(500).send({ success: false, msg: 'Error getting faqs.' });
      });
    }
  })
});

module.exports = { router: router};