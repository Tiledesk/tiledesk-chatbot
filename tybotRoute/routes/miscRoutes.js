const winston = require('../utils/winston.js');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { runtimeContext } = require('./runtimeContext.js');

/**
 * Health check, the web-request test fixtures used by the test suite and the
 * echo bot. Extracted verbatim from tybotRoute/index.js (Phase 6a).
 */
function registerMiscRoutes(router) {

router.get('/', (req, res) => {
  res.send('Hello Tilebot!');
});

router.get('/test/webrequest/get/plain/:username', async (req, res) => {
  res.send(`Application var ${req.params['username']}`);
});

router.post('/test/webrequest/post/plain', async (req, res) => {
  winston.verbose("(tybotRoute) POST /test/webrequest/post/plain called");
  winston.debug("(tybotRoute) POST /test/webrequest/post/plain req.body:", req.body);
  if (req && req.body && req.body.name) {
    res.send("Your name is " + req.body.name);
  }
  else {
    res.send("No HTTP POST provided");
  }
});

router.post('/echobot', (req, res) => {
  winston.verbose("(tybotRoute) POST /echobot called");
  winston.debug("(tybotRoute) POST /echobot req.body: ", req.body.payload);

  const message = req.body.payload;
  const token = req.body.token;
  const requestId = message.request.request_id;
  const projectId = message.id_project;

  const tdclient = new TiledeskClient({
    projectId: projectId,
    token: token,
    APIURL: runtimeContext.API_ENDPOINT,
    APIKEY: "___"
  });

  // instantly reply "success" to TILEDESK
  res.status(200).send({"success":true});
  // Replies are asynchronous
  let msg = {
    text: message.text
  }
  tdclient.sendSupportMessage(requestId, msg, (err, response) => {
    if (err) {
      winston.error("(tybotRoute) Error sending message"); //, err);
    }
  });
});

}

module.exports = { registerMiscRoutes };
