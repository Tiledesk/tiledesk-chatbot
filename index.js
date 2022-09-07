require('dotenv').config();
var express = require('express');

var app = express();
const tybot = require("@tiledesk/tiledesk-tybot-connector");
//const tybot = require("./tybotRoute");
const tybotRoute = tybot.router;
app.use("/", tybotRoute); // /tybot

tybot.startApp(
  {
    MONGODB_URI: process.env.mongoUrl,
    API_ENDPOINT: process.env.API_ENDPOINT,
    log: process.env.TILEBOT_LOG
  }, () => {
    console.log("Tilebot route successfully started.");
    var port = process.env.PORT || 3000;
    app.listen(port, function () {
      console.log('Tilebot connector listening on port ', port);
    });
  }
);

/* GETS PARAMS FROM PROCESS.ENV
tybot.startApp(() => {
    console.log("Tybot route successfully started.");
    var port = process.env.PORT || 3000;
    app.listen(port, function () {
      console.log('Tilebot connector listening on port:', port);
    });
  }
);
*/
