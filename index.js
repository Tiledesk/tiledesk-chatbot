require('dotenv').config();
var express = require('express');
var app = express();
var cors = require('cors');
app.use(cors());

const tybot = require("./tybotRoute");
const tybotRoute = tybot.router;
app.use("/", tybotRoute); // /tybot

const templates = require("./templatesRoute");
const templatesRoute = templates.router;
app.use("/chatbots", templatesRoute);

// const chooser_bot = require("./chooserChatbotRoute");
// const chooserRoute = chooser_bot.router;
// app.use("/langbot", chooserRoute);

// TEMP
// const bots_data = require('./tybotRoute/test/conversation-actions_bot.js').bots_data;

tybot.startApp(
  {
    MONGODB_URI: process.env.MONGODB_URI,
    TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
    // bots: bots_data,
    API_ENDPOINT: process.env.API_ENDPOINT,
    REDIS_HOST: process.env.CACHE_REDIS_HOST,
    REDIS_PORT: process.env.CACHE_REDIS_PORT,
    REDIS_PASSWORD: process.env.CACHE_REDIS_PASSWORD,
    // CACHE_ENABLED: process.env.CACHE_ENABLED
  }, () => {
    console.log("Tilebot route successfully started.");
    var port = process.env.PORT || 3000;
    app.listen(port, function () {
      console.log('Tilebot connector listening on port ', port);
    });
  });
