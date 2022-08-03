require('dotenv').config();
var express = require('express');

var app = express();
const tybot = require("@tiledesk/tiledesk-tybot-connector");
//const tybot = require("./tybotRoute");
const tybotRoute = tybot.router;
app.use("/", tybotRoute); // /tybot

tybot.startTybot(
  {
    KVBASE_COLLECTION : process.env.KVBASE_COLLECTION,
    MONGODB_URI: process.env.MONGODB_URI,
    API_ENDPOINT: process.env.API_ENDPOINT,
    //chatbotInfo: { // solo per test, ignorare in prod
    //  serverUrl: 'http://34.254.90.35/webhooks/rest/webhook'
    //},
    log: true
  }, () => {
    console.log("RASA route successfully started.");
    var port = process.env.PORT || 3000;
    app.listen(port, function () {
      console.log('RASA connector listening on port ', port);
    });
  }
);

app.get('/', (req, res) => {
  res.write("Hello from RASA connector");
  res.end();
});