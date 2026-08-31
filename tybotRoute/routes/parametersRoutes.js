const { TiledeskChatbot } = require('../engine/TiledeskChatbot.js');
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil.js');
const { runtimeContext } = require('./runtimeContext.js');

/**
 * Read-only introspection routes: cached message context and the request
 * (flow) parameters, both the reserved and the public variants.
 * Extracted verbatim from tybotRoute/index.js (Phase 6a).
 */
function registerParametersRoutes(router) {

router.get('/message/context/:messageid', async (req, res) => {
  const messageid = req.params.messageid;
  const message_key = "tiledesk:messages:context:" + messageid;
  const message_context_s = await runtimeContext.tdcache.get(message_key);
  if (message_context_s) {
    const message_context = JSON.parse(message_context_s);
    res.send(message_context);
  }
  else {
    res.send(null);
  }
});

router.get('/ext/reserved/parameters/requests/:requestid', async (req, res) => {
  const requestId = req.params.requestid;
  const parameters = await TiledeskChatbot.allParametersStatic(runtimeContext.tdcache, requestId);
  if (parameters === null) {
    res.send([]);
    return;
  }
  if (req.query.all != null) {
    res.send(parameters);
  }
  else {
    const userParams = TiledeskChatbotUtil.userFlowAttributes(parameters);
    res.send(userParams);
  }
});

router.get('/ext/parameters/requests/:requestid', async (req, res) => {

  const requestId = req.params.requestid;
  if (!requestId) {
    res.status(404).send("Not found");
    return;
  }
  const request_parts = requestId.split("-");
  if (request_parts && request_parts.length >= 4) {
    const project_id = request_parts[2];
    if (project_id !== "656054000410fa00132e5dcc") { //&& project_id !== "ANOTHER P_ID"
      res.status(401).send("Unauthorized");
      return;
    }
  }
  else if (!request_parts || (request_parts && request_parts.length < 4) ) {
    res.status(500).send("Invalid request id " + requestId);
    return;
  }
  const parameters = await TiledeskChatbot.allParametersStatic(runtimeContext.tdcache, requestId);
  if (parameters === null) {
    res.send([]);
    return;
  }
  if (req.query.all != null) {
    res.send(parameters);
  }
  else {
    const userParams = TiledeskChatbotUtil.userFlowAttributes(parameters);
    res.send(userParams);
  }
});

}

module.exports = { registerParametersRoutes };
