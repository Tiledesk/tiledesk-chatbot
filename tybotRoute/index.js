const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');

// Required for their module load side effects / historical import order.
// eslint-disable-next-line no-unused-vars
const { TiledeskChatbotConst } = require('./engine/TiledeskChatbotConst.js');
// eslint-disable-next-line no-unused-vars
const AiService = require('./services/AIService.js');

const { registerMessageRoutes } = require('./routes/messageRoutes.js');
const { registerParametersRoutes } = require('./routes/parametersRoutes.js');
const { registerMiscRoutes } = require('./routes/miscRoutes.js');
const { registerBlockRoutes } = require('./routes/blockRoutes.js');
const { startApp } = require('./startApp.js');
const { guardRouter } = require('./routes/asyncErrorBoundary.js');

router.use(bodyParser.json({limit: '50mb'}));
router.use(bodyParser.urlencoded({ extended: true , limit: '50mb'}));

// Registration order is significant for express: it reproduces exactly the
// order the routes were declared in before the Phase 6a split.
//
// Every handler goes on through guardRouter: express 4 does not await an async
// handler, so a rejection left the client waiting on an unanswered socket AND
// killed the worker (Node defaults to --unhandled-rejections=throw). See
// routes/asyncErrorBoundary.js.
const guarded = guardRouter(router);
registerMessageRoutes(guarded);
registerParametersRoutes(guarded);
registerMiscRoutes(guarded);
registerBlockRoutes(guarded);

module.exports = { router: router, startApp: startApp};
