const winston = require('./utils/winston.js');
const { TdCache } = require('./TdCache.js');
let mongoose = require('mongoose');
const { runtimeContext } = require('./routes/runtimeContext.js');

/**
 * Application bootstrap: validates the settings, populates runtimeContext and
 * connects MongoDB / Redis. Extracted from tybotRoute/index.js (Phase 6a);
 * the only behaviour change is that a missing settings.API_ENDPOINT now also
 * reaches the completion callback instead of vanishing (see below).
 */
async function startApp(settings, completionCallback) {
  winston.info("(Tilebot) Starting Tilebot..")

  if (settings.bots) { // static bots data source
    runtimeContext.staticBots = settings.bots;
  }
  else { // mongodb data source
    if (!settings.MONGODB_URI) {
      throw new Error("settings.MONGODB_URI is mandatory id no settings.bots.");
    }
  }
  
  if (!settings.API_ENDPOINT) {
    // A bare `throw` here used to be swallowed: startApp is async, so the
    // rejection went to an unhandled promise nobody was watching and every
    // callback-style caller (the test `before` hooks, the connector bootstrap)
    // just hung until it timed out. Surface the failure on the completion
    // callback as well, then still reject the returned promise as before.
    const error = new Error("settings.API_ENDPOINT is mandatory id no settings.bots.");
    if (completionCallback) {
      completionCallback(error);
    }
    throw error;
  }
  else {
    runtimeContext.API_ENDPOINT = settings.API_ENDPOINT;
    winston.info("(Tilebot) settings.API_ENDPOINT:" + runtimeContext.API_ENDPOINT);
  }

  if (!settings.TILEBOT_ENDPOINT) {
    runtimeContext.TILEBOT_ENDPOINT = `${runtimeContext.API_ENDPOINT}/modules/tilebot`
  }
  else {
    runtimeContext.TILEBOT_ENDPOINT = settings.TILEBOT_ENDPOINT
  }
  winston.info("(Tilebot) settings.TILEBOT_ENDPOINT:" + runtimeContext.TILEBOT_ENDPOINT);

  if (settings.REDIS_HOST && settings.REDIS_PORT) {
    runtimeContext.tdcache = new TdCache({
      host: settings.REDIS_HOST,
      port: settings.REDIS_PORT,
      password: settings.REDIS_PASSWORD
    });
  }
  
  winston.info("(Tilebot) Log Level: " + process.env.LOG_LEVEL);

  if (process.env.CHATBOT_MAX_STEPS) {
    runtimeContext.MAX_STEPS = Number(process.env.CHATBOT_MAX_STEPS);
  }

  if (process.env.CHATBOT_MAX_EXECUTION_TIME) {
    runtimeContext.MAX_EXECUTION_TIME = Number(process.env.CHATBOT_MAX_EXECUTION_TIME);// test // prod1000 * 3600 * 4; // 4 hours
  }

  winston.info("(Tilebot) MAX_STEPS: " + runtimeContext.MAX_STEPS);
  winston.info("(Tilebot) MAX_EXECUTION_TIME: " + runtimeContext.MAX_EXECUTION_TIME);
  
  var pjson = require('./package.json');
  winston.info("(Tilebot) Starting Tilebot connector v" + pjson.version);

  if (!runtimeContext.staticBots) {
    winston.info("(Tilebot) Connecting to MongoDB...");
    // connection = 
    mongoose.connect(settings.MONGODB_URI, { "useNewUrlParser": true, "autoIndex": false }, async (err) => {
      if (err) { 
        winston.error('(Tilebot) Failed to connect to MongoDB on ' + settings.MONGODB_URI + " ", err);
      }
      else {
        winston.info("(Tilebot) MongoDB Connected");
        await connectRedis();
        winston.info("(Tilebot) Tilebot started");

        if (completionCallback) {
          completionCallback();
        }
      }
    });
  }
  else {
    winston.info("(Tilebot) Using static bots");
    await connectRedis();
    winston.info("(Tilebot) Tilebot started");
    if (completionCallback) {
      completionCallback();
    }
  }
}

async function connectRedis() {
  if (runtimeContext.tdcache) {
    try {
      winston.info("(Tilebot) Connecting Redis...");
      await runtimeContext.tdcache.connect();
    }
    catch (error) {
      runtimeContext.tdcache = null;
      winston.error("(Tilebot) Redis connection error: ", error);
      process.exit(1);
    }
    winston.info("(Tilebot) Redis connected");
  }
  return;
}

module.exports = { startApp, connectRedis };
