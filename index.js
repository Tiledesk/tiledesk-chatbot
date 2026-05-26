require('dotenv').config();
var express = require('express');
var app = express();
var cors = require('cors');
app.use(cors());

// const tybot = require("@tiledesk/tiledesk-tybot-connector");
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

let server = null;
let shuttingDown = false;

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
    server = app.listen(port, function () {
      console.log('Tilebot connector listening on port ', port);
    });
    // Honour Docker's stop_grace_period — close cleanly within window
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
  });

/**
 * Graceful shutdown — drains inflight HTTP requests, stops background
 * services (flow supervisor), disconnects Redis + Mongo, then exits.
 *
 * Triggered by Docker on `docker stop` / compose recreate via SIGTERM,
 * or by Ctrl+C via SIGINT. Falls back to a hard exit if the configured
 * grace window expires (matches stop_grace_period in compose).
 */
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] received ${signal}, draining...`);

  const graceMs = parseInt(process.env.SHUTDOWN_GRACE_MS, 10) || 55000;
  const forceTimer = setTimeout(() => {
    console.error('[shutdown] grace window expired, forcing exit');
    process.exit(1);
  }, graceMs);
  forceTimer.unref();

  // 1. Stop accepting new HTTP connections; allow in-flight to finish
  if (server) {
    await new Promise((resolve) => {
      server.close((err) => {
        if (err) console.error('[shutdown] server.close error:', err.message);
        else console.log('[shutdown] HTTP server closed');
        resolve();
      });
    });
  }

  // 2. Stop background services + disconnect from infra
  try {
    if (typeof tybot.stopApp === 'function') {
      await tybot.stopApp();
    }
  } catch (e) {
    console.error('[shutdown] stopApp error:', e && e.message ? e.message : e);
  }

  console.log('[shutdown] clean exit');
  clearTimeout(forceTimer);
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
