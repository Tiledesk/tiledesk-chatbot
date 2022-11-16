const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
cont templates = require("templates.json");

router.get('/', (req, res) => {
  res.send('Hello Chatbot Templates!');
});

router.get('/templates', (req, res) => {
  res.send(templates);
});
