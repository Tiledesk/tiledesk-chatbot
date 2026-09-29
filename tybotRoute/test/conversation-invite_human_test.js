var assert = require('assert');
const tybot = require("..");
const tybotRoute = tybot.router;
var express = require('express');
var app = express();
const winston = require('../utils/winston');
app.use("/", tybotRoute);
app.use((err, req, res, next) => {
  winston.error("General error", err);
});
require('dotenv').config();
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const bots_data = require('./conversation-invite_human_bot.js').bots_data;
const tilebotService = require('../services/TilebotService');
const { DirInviteHuman } = require('../tiledeskChatbotPlugs/directives/DirInviteHuman');

const PROJECT_ID = "projectID";
const BOT_ID = "botID";
const CHATBOT_TOKEN = "XXX";
const SERVER_PORT = 10001;
const API_PORT = 10002;

function supportRequestId() {
  return "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
}

function automationRequestId() {
  return "automation-request-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
}

function userMessage(requestId, text, extra) {
  return {
    "payload": Object.assign({
      "_id": uuidv4(),
      "senderFullname": "guest#367e",
      "type": "text",
      "sender": "A-SENDER",
      "recipient": requestId,
      "text": text,
      "id_project": PROJECT_ID,
      "metadata": "",
      "request": { "request_id": requestId }
    }, extra || {}),
    "token": CHATBOT_TOKEN
  };
}

const ONCALL_PAYLOAD = { attributes: { payload: { oncall: ['a@acme.it', 'b@acme.it'] } } };

function replyText(message) {
  const commands = message.attributes && message.attributes.commands;
  const messageCommand = commands && commands.find((c) => c.type === "message");
  return messageCommand ? messageCommand.message.text : message.text;
}

/** Starts the mock Tiledesk API; handlers receive (req, res, finish) where finish(err?) closes it and ends the test. */
function mockApi(done, handlers) {
  const endpointServer = express();
  endpointServer.use(bodyParser.json());
  let listener;
  const finish = (err) => listener.close(() => done(err));
  endpointServer.post('/:projectId/requests/:requestId/participants/invite', (req, res) => {
    try {
      handlers.invite(req, res, finish);
    } catch (err) {
      res.status(500).send({});
      finish(err);
    }
  });
  endpointServer.post('/:projectId/requests/:requestId/messages', (req, res) => {
    res.send({ success: true });
    try {
      handlers.message(replyText(req.body), finish);
    } catch (err) {
      finish(err);
    }
  });
  return new Promise((resolve) => {
    listener = endpointServer.listen(API_PORT, '0.0.0.0', () => resolve(listener));
  });
}

describe('Conversation for Invite human test', async () => {

  let app_listener;

  before(() => {
    return new Promise((resolve) => {
      tybot.startApp({
        bots: bots_data,
        TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
        API_ENDPOINT: process.env.API_ENDPOINT,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD
      }, () => {
        app_listener = app.listen(SERVER_PORT, () => resolve());
      });
    });
  });

  after(function (done) {
    app_listener.close(() => done());
  });

  it('invites the resolved members and continues in the invited block', (done) => {
    const REQUEST_ID = supportRequestId();
    let inviteCalled = false;
    mockApi(done, {
      invite: (req, res) => {
        inviteCalled = true;
        assert.strictEqual(req.params.projectId, PROJECT_ID);
        assert.strictEqual(req.params.requestId, REQUEST_ID);
        assert.strictEqual(req.headers.authorization, 'JWT ' + CHATBOT_TOKEN);
        assert.strictEqual(req.body.department_id, 'dep-sre');
        assert.deepStrictEqual(req.body.members, ['a@acme.it', 'b@acme.it', 'ops@acme.it']);
        assert.strictEqual(req.body.fallback_intent, '#noone-id');
        res.send({ request_id: REQUEST_ID, department_id: 'dep-sre', invited: [{ id_user: 'agent-1', fullname: 'Agent One', already_participant: false }] });
      },
      message: (text, finish) => {
        assert.strictEqual(text, 'invited 1: restart?');
        assert.strictEqual(inviteCalled, true);
        finish();
      }
    }).then(() => {
      tilebotService.sendMessageToBot(userMessage(REQUEST_ID, '/invite', ONCALL_PAYLOAD), BOT_ID, () => {});
    });
  });

  it('goes to the "no human available" block when nobody is invited', (done) => {
    const REQUEST_ID = supportRequestId();
    mockApi(done, {
      invite: (req, res) => {
        res.send({ request_id: REQUEST_ID, department_id: 'dep-sre', invited: [], reason: 'no_available_agents' });
      },
      message: (text, finish) => {
        assert.strictEqual(text, 'no human available|');
        finish();
      }
    }).then(() => {
      tilebotService.sendMessageToBot(userMessage(REQUEST_ID, '/invite', ONCALL_PAYLOAD), BOT_ID, () => {});
    });
  });

  it('goes to the "no human available" block when the server fails', (done) => {
    const REQUEST_ID = supportRequestId();
    mockApi(done, {
      invite: (req, res) => {
        res.status(500).send({ success: false, error: 'boom' });
      },
      message: (text, finish) => {
        assert.strictEqual(text, 'no human available|(Invite human) An error occurred: boom');
        finish();
      }
    }).then(() => {
      tilebotService.sendMessageToBot(userMessage(REQUEST_ID, '/invite', ONCALL_PAYLOAD), BOT_ID, () => {});
    });
  });

  it('goes to the "no human available" block with the server reason on a 422', (done) => {
    const REQUEST_ID = supportRequestId();
    mockApi(done, {
      invite: (req, res) => {
        res.status(422).send({ success: false, error: 'Invite human requires a conversation started by a webhook' });
      },
      message: (text, finish) => {
        assert.strictEqual(text, 'no human available|(Invite human) An error occurred: Invite human requires a conversation started by a webhook');
        finish();
      }
    }).then(() => {
      tilebotService.sendMessageToBot(userMessage(REQUEST_ID, '/invite', ONCALL_PAYLOAD), BOT_ID, () => {});
    });
  });

  it('goes to the "no human available" block with a timeout flowError when the server is slow', (done) => {
    const REQUEST_ID = supportRequestId();
    DirInviteHuman.INVITE_TIMEOUT_MS = 500;
    mockApi(done, {
      invite: (req, res) => {
        // Answers well after the 500ms invite timeout; guard against writing
        // to a connection the client (axios) has already given up on.
        setTimeout(() => {
          try {
            res.send({ request_id: REQUEST_ID, department_id: 'dep-sre', invited: [] });
          } catch (err) {
            // client already timed out: ignore
          }
        }, 2000);
      },
      message: (text, finish) => {
        DirInviteHuman.INVITE_TIMEOUT_MS = 30000;
        let assertionError = null;
        try {
          assert.strictEqual(text, 'no human available|(Invite human) An error occurred: timeout of 500ms exceeded');
        } catch (err) {
          assertionError = err;
        }
        // Close the mock listener only after the delayed invite response has
        // fired, so listener.close() does not hang on the still-open connection.
        setTimeout(() => finish(assertionError), 1700);
      }
    }).then(() => {
      tilebotService.sendMessageToBot(userMessage(REQUEST_ID, '/invite', ONCALL_PAYLOAD), BOT_ID, () => {});
    });
  }).timeout(10000);

  it('does not call the server for automation runs', (done) => {
    const REQUEST_ID = automationRequestId();
    mockApi(done, {
      invite: () => {
        throw new Error('invite endpoint must not be called for automation runs');
      },
      message: (text, finish) => {
        assert.strictEqual(text, 'no human available|(Invite human) requires a conversation');
        finish();
      }
    }).then(() => {
      tilebotService.sendMessageToBot(userMessage(REQUEST_ID, '/invite', ONCALL_PAYLOAD), BOT_ID, () => {});
    });
  });

  it('resumes with the human answer after the invite (HITL round trip)', (done) => {
    const REQUEST_ID = supportRequestId();
    mockApi(done, {
      invite: (req, res) => {
        res.send({ request_id: REQUEST_ID, department_id: 'dep-sre', invited: [{ id_user: 'agent-1', fullname: 'Agent One', already_participant: false }] });
      },
      message: (text, finish) => {
        if (text === 'invited 1: restart?') {
          tilebotService.sendMessageToBot(userMessage(REQUEST_ID, 'Approve', { sender: 'agent-1', senderFullname: 'Agent One' }), BOT_ID, () => {});
        } else {
          assert.strictEqual(text, 'approved by agent-1');
          finish();
        }
      }
    }).then(() => {
      tilebotService.sendMessageToBot(userMessage(REQUEST_ID, '/invite', ONCALL_PAYLOAD), BOT_ID, () => {});
    });
  });

  it('jumps to the "no human available" block when the server sends the fallback action', (done) => {
    const REQUEST_ID = supportRequestId();
    mockApi(done, {
      invite: (req, res) => {
        res.send({ request_id: REQUEST_ID, department_id: 'dep-sre', invited: [{ id_user: 'agent-1', fullname: 'Agent One', already_participant: false }] });
      },
      message: (text, finish) => {
        if (text === 'invited 1: restart?') {
          tilebotService.sendMessageToBot(userMessage(REQUEST_ID, 'The invited human left and no replacement is available', { sender: 'system', senderFullname: 'System', attributes: { subtype: 'info', hitl_fallback: true, action: '#noone-id{"flowError":"(Invite human) The invited human left and no replacement is available"}' } }), BOT_ID, () => {});
        } else {
          assert.strictEqual(text, 'no human available|(Invite human) The invited human left and no replacement is available');
          finish();
        }
      }
    }).then(() => {
      tilebotService.sendMessageToBot(userMessage(REQUEST_ID, '/invite', ONCALL_PAYLOAD), BOT_ID, () => {});
    });
  });
});
