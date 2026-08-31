const winston = require('../utils/winston.js');
const { v4: uuidv4 } = require('uuid');
const { customAlphabet } = require('nanoid');
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);
const tilebotService = require('../services/TilebotService.js');
const { runtimeContext } = require('./runtimeContext.js');

/**
 * Webhook style block invocation (sync and async variants).
 * Extracted verbatim from tybotRoute/index.js (Phase 6a).
 */
function registerBlockRoutes(router) {

router.post('/block/:project_id/:bot_id/:block_id', async (req, res) => {

  const project_id = req.params.project_id;
  const bot_id = req.params.bot_id;
  const block_id = req.params.block_id;
  const body = req.body;

  winston.verbose("(tybotRoute) POST /block/:project_id/:bot_id/:block_id called");
  winston.debug("(tybotRoute) POST /block/:project_id/:bot_id/:block_id req.body: ", body);

  const async = body.async;
  const token = body.token;
  delete body.async;
  delete body.token;

  let draft = req.body.draft || false;
  
  // invoke block
  // unique ID for each execution
  let request_id;
  if (body.preloaded_request_id) {
    request_id = body.preloaded_request_id;
  } else {
    const execution_id = uuidv4().replace(/-/g, '');
    request_id = "automation-request-" + project_id + "-" + execution_id;
  }
  // webhook.triggered is emitted by tiledesk-server (routes/webhook.js) — the
  // single source for production webhook automations (it carries webhook_id and
  // excludes dev/draft runs). Not emitted here to avoid double-counting; the
  // block execution itself is already recorded via agent.block_executed.

  const command = "/#" + block_id;
  let message = {
    payload: {
      recipient: request_id,
      text: command,
      id_project: project_id,
      request: {
        request_id: request_id,
        draft: draft
      },
      attributes: {
        payload: body
      }
    },
    token: token
  }

  if (async) {
    winston.verbose("Async webhook");
    tilebotService.sendMessageToBot(message, bot_id, (err, resbody) => {
      if (err) {
        winston.error("Async webhook err:\n", err);
        return res.status(500).send({ success: false, error: err });
      }
      return res.status(200).send({ success: true });
    })
  } else {
    
    winston.verbose("Sync webhook. Subscribe and await for reply...")
    let uniqueid = nanoid();
    const topic = `/webhooks/${request_id}`;
    
    try {

      const listener = async (message, topic) => {
        winston.debug("Web response is: " + JSON.stringify(message) + " for topic " + topic);
        await runtimeContext.tdcache.unsubscribe(topic);

        let json = JSON.parse(message);
        let status = json.status ? json.status : 200;
        winston.debug("Web response status: " + status);

        return res.status(status).send(json.payload);
      }
      await runtimeContext.tdcache.subscribe(topic, listener);

    } catch(err) {
      winston.error("Error cache subscribe ", err);
      return res.status(500).send({ success: false, error: "Error during cache subscription"})
    }

    tilebotService.sendMessageToBot(message, bot_id, () => {
      winston.debug("Sync webhook message sent: ", message);
    })
  }

});

}

module.exports = { registerBlockRoutes };
