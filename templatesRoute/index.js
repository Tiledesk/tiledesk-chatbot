const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

router.get('/', (req, res) => {
  res.send('Hello Chatbot Templates!');
});

router.get('/templates', (req, res) => {
  console.log("REQUEST BODY:", JSON.stringify(req.body));
  const text = req.body.text;
  console.log("query text:", text);
  const botId = req.body.botId;
  console.log("query botId:", botId);
  res.send(
    [
      {
        "template1": "blank"
      },
      {
        "template2": "handoff"
      }
    ]
  );
});

