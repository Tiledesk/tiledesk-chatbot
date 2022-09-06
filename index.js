require('dotenv').config();
var express = require('express');

var app = express();
//const tybot = require("@tiledesk/tiledesk-tybot-connector");
const tybot = require("./tybotRoute");
const tybotRoute = tybot.router;
app.use("/", tybotRoute); // /tybot

tybot.startApp(
  {
    //KVBASE_COLLECTION : process.env.KVBASE_COLLECTION,
    MONGODB_URI: process.env.mongoUrl,
    API_ENDPOINT: process.env.API_ENDPOINT,
    log: true
  }, () => {
    console.log("Tybot route successfully started.");
    var port = process.env.PORT || 3000;
    app.listen(port, function () {
      console.log('Tybot connector listening on port ', port);
    });
  }
);

/*
var port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log('Tybot connector listening on port ', port);
});
*/