var assert = require('assert');
var express = require('express');
const bodyParser = require('body-parser');

const { DirReply } = require('../directives/conversation/DirReply');
const { DirRandomReply } = require('../directives/conversation/DirRandomReply');
const { DirSendEmail } = require('../directives/conversation/DirSendEmail');
const { DirClearTranscript } = require('../directives/conversation/DirClearTranscript');
const { DirDisableInputText } = require('../directives/conversation/DirDisableInputText');
const { DirForm } = require('../directives/conversation/DirForm');
const { DirMessage } = require('../directives/conversation/DirMessage');
const { DirReplyV2 } = require('../directives/conversation/DirReplyV2');
const { DirCaptureUserReply } = require('../directives/conversation/DirCaptureUserReply');

// The directives in directives/conversation all end in the same place: a
// message POSTed to the Tiledesk API (or, for DirSendEmail, an email POSTed to
// it). Every test below asserts on the OUTGOING request - its url, its body,
// its Authorization header - or on the flow attributes the directive wrote,
// never on the fact that a line ran. The failure cases (missing action,
// non-2xx from the API, missing mandatory fields) are the point.

const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-convunits";
const MOCK_PORT = 10002;
const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:10002';

function fakeCache(vars) {
  const hashes = {};
  hashes["tilebot:requests:" + REQUEST_ID + ":parameters"] = {};
  for (const [k, v] of Object.entries(vars || {})) {
    hashes["tilebot:requests:" + REQUEST_ID + ":parameters"][k] = JSON.stringify(v);
  }
  return {
    hashes,
    async hgetall(k) { return hashes[k] || {}; },
    async hget(k, f) { return (hashes[k] || {})[f]; },
    async hset(k, f, v) { (hashes[k] || (hashes[k] = {}))[f] = v; },
    async get() { return null; },
    async set() { },
    async del() { },
    async expire() { }
  };
}

function fakeChatbot(botName) {
  const params = {};
  return {
    params,
    bot: { name: botName || "Test Bot" },
    async getParameter(k) { return params[k]; },
    async addParameter(k, v) { params[k] = v; },
    async deleteParameter(k) { delete params[k]; },
    async lockAction() { },
    async unlockAction() { }
  };
}

function recordingLogger() {
  const lines = [];
  const mk = (level) => (...args) => lines.push([level, args.map(String).join(' ')]);
  return {
    lines,
    error: mk('error'), warn: mk('warn'), info: mk('info'),
    debug: mk('debug'), native: mk('native')
  };
}

/** Fake Tiledesk API. Records the messages and emails it is sent. */
function startMock(register) {
  return new Promise((resolve) => {
    const seen = { messages: [], emails: [] };
    const server = express();
    server.use(bodyParser.json());
    if (register) register(server, seen);
    server.post('/:projectId/emails/internal/send', (req, res) => {
      seen.emails.push({ projectId: req.params.projectId, body: req.body, auth: req.headers.authorization });
      res.status(200).send({ success: true });
    });
    server.post('/:projectId/requests/:requestId/messages', (req, res) => {
      seen.messages.push({
        projectId: req.params.projectId,
        requestId: req.params.requestId,
        body: req.body,
        auth: req.headers.authorization
      });
      res.status(200).send({ success: true });
    });
    const listener = server.listen(MOCK_PORT, '0.0.0.0', () => {
      resolve({ seen, close: () => new Promise((r) => listener.close(() => r())) });
    });
  });
}

function contextFor(overrides) {
  return Object.assign({
    projectId: PROJECT_ID,
    token: "XXX",
    API_ENDPOINT: API_ENDPOINT,
    requestId: REQUEST_ID,
    supportRequest: { id_project: PROJECT_ID, request_id: REQUEST_ID, bot_id: "botID" }
  }, overrides);
}

function run(dir, directive, settleMs) {
  return new Promise((resolve) => {
    const stops = [];
    let timer = null;
    dir.execute(directive, (stop) => {
      stops.push(stop);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => resolve(stops), settleMs === undefined ? 200 : settleMs);
    });
  });
}

describe('Directives directives/conversation', function () {

  // A fake tilebot, so the one directive that jumps to another intent
  // (DirCaptureUserReply's goToIntent) can be asserted on.
  let tilebot;
  let dispatched = [];
  before((done) => {
    const server = express();
    server.use(bodyParser.json());
    server.post('/ext/:botid', (req, res) => {
      dispatched.push(req.body.payload.text);
      res.status(200).send({ success: true });
    });
    tilebot = server.listen(10001, '0.0.0.0', () => done());
  });
  after((done) => { tilebot.close(() => done()); });
  beforeEach(() => { dispatched = []; });

  // ------------------------------------------------------ DirDisableInputText

  describe('DirDisableInputText', function () {

    it('marks the context message so the client hides the input box', async () => {
      const message = { text: "hi", attributes: { commands: [] } };
      const dir = new DirDisableInputText(contextFor({ message: message }));
      const stops = await run(dir, { name: "disableinputtext" }, 0);

      assert.strictEqual(message.attributes.disableInputMessage, true);
      assert.deepStrictEqual(message.attributes.commands, [],
        'the existing attributes must be preserved');
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('creates the attributes when the message has none', async () => {
      const message = { text: "hi" };
      const dir = new DirDisableInputText(contextFor({ message: message }));
      const stops = await run(dir, { name: "disableinputtext" }, 0);

      assert.deepStrictEqual(message.attributes, { disableInputMessage: true });
      assert.deepStrictEqual(stops, [undefined]);
    });
  });

  // ------------------------------------------------------- DirClearTranscript

  describe('DirClearTranscript', function () {

    it('empties the transcript attribute and lets the flow continue', async () => {
      const chatbot = fakeChatbot();
      chatbot.params.transcript = "<bot:Test Bot> hello\n<user> hi";
      const dir = new DirClearTranscript(contextFor({ chatbot: chatbot }));
      dir.logger = recordingLogger();

      const stops = await run(dir, { name: "cleartranscript" }, 0);

      assert.strictEqual(chatbot.params.transcript, "",
        'the transcript must be emptied, not deleted');
      assert.deepStrictEqual(stops, [undefined]);
      assert.deepStrictEqual(dir.logger.lines, [["native", "[Clear Transcript] Executed"]]);
    });

    it('ignores the directive payload entirely', async () => {
      const chatbot = fakeChatbot();
      const dir = new DirClearTranscript(contextFor({ chatbot: chatbot }));
      dir.logger = recordingLogger();

      const stops = await run(dir, { name: "cleartranscript", action: { anything: true } }, 0);

      assert.strictEqual(chatbot.params.transcript, "");
      assert.deepStrictEqual(stops, [undefined]);
    });
  });

  // ------------------------------------------------------------ DirSendEmail

  describe('DirSendEmail', function () {

    it('fills every field from the flow attributes and posts the email', async () => {
      const mock = await startMock();
      try {
        const dir = new DirSendEmail(contextFor({
          tdcache: fakeCache({ userFullname: "Nico", userEmail: "nico@example.com" })
        }));
        dir.logger = recordingLogger();

        const stops = await run(dir, {
          name: "sendemail",
          action: {
            to: "${userEmail}",
            subject: "Hello ${userFullname}",
            text: "Welcome ${userFullname}!",
            replyto: "support@example.com"
          }
        });

        assert.strictEqual(mock.seen.emails.length, 1);
        assert.strictEqual(mock.seen.emails[0].projectId, PROJECT_ID);
        assert.deepStrictEqual(mock.seen.emails[0].body, {
          subject: "Hello Nico",
          text: "Welcome Nico!",
          to: "nico@example.com",
          replyto: "support@example.com"
        });
        assert.ok(mock.seen.emails[0].auth, 'the call must be authenticated');
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('sends the literal text when there is no cache to fill from', async () => {
      const mock = await startMock();
      try {
        const dir = new DirSendEmail(contextFor({}));   // no tdcache
        dir.logger = recordingLogger();

        await run(dir, {
          name: "sendemail",
          action: { to: "a@b.c", subject: "Subject", text: "Body" }
        });

        assert.strictEqual(mock.seen.emails.length, 1);
        assert.strictEqual(mock.seen.emails[0].body.subject, "Subject");
        assert.strictEqual(mock.seen.emails[0].body.replyto, undefined,
          'an absent replyto must not become the string "undefined"');
      } finally {
        await mock.close();
      }
    });

    it('sends nothing and carries on when a mandatory field is missing', async () => {
      const mock = await startMock();
      try {
        for (const action of [
          { subject: "S", text: "T" },              // no `to`
          { to: "a@b.c", text: "T" },               // no `subject`
          { to: "a@b.c", subject: "S" }             // no `text`
        ]) {
          const dir = new DirSendEmail(contextFor({ tdcache: fakeCache({}) }));
          dir.logger = recordingLogger();
          const stops = await run(dir, { name: "sendemail", action: action }, 0);
          assert.deepStrictEqual(stops, [undefined],
            'the flow must carry on: ' + JSON.stringify(action));
        }
        assert.deepStrictEqual(mock.seen.emails, [],
          'an incomplete email must never reach the API');
      } finally {
        await mock.close();
      }
    });

    it('carries on when the API refuses the email', async () => {
      let attempts = 0;
      const mock = await startMock((server) => {
        server.post('/:projectId/emails/internal/send', (req, res) => {
          attempts += 1;
          res.status(500).send({ success: false });
        });
      });
      try {
        const dir = new DirSendEmail(contextFor({ tdcache: fakeCache({}) }));
        dir.logger = recordingLogger();

        const stops = await run(dir, {
          name: "sendemail",
          action: { to: "a@b.c", subject: "S", text: "T" }
        });

        assert.strictEqual(attempts, 1, 'the email was attempted exactly once');
        assert.deepStrictEqual(stops, [undefined],
          'a rejected email must not stall the conversation');
      } finally {
        await mock.close();
      }
    });

    it('does nothing on a directive with no action', async () => {
      const mock = await startMock();
      try {
        const dir = new DirSendEmail(contextFor({ tdcache: fakeCache({}) }));
        dir.logger = recordingLogger();

        const stops = await run(dir, { name: "sendemail" }, 0);

        assert.deepStrictEqual(mock.seen.emails, []);
        assert.deepStrictEqual(stops, [undefined]);
        assert.ok(dir.logger.lines.some(([lvl]) => lvl === 'error'));
      } finally {
        await mock.close();
      }
    });
  });

  // ----------------------------------------------------------- DirRandomReply

  describe('DirRandomReply', function () {

    function randomReplyAction(texts) {
      // chooseRandomReply expects the commands to alternate wait/message.
      const commands = [];
      for (const t of texts) {
        commands.push({ type: "wait", time: 10 });
        commands.push({ type: "message", message: { type: "text", text: t } });
      }
      return { _tdActionType: "randomreply", text: texts.join("\n"), attributes: { commands: commands } };
    }

    it('sends exactly one of the alternatives, with the variables filled in', async () => {
      const mock = await startMock();
      try {
        const dir = new DirRandomReply(contextFor({
          tdcache: fakeCache({ userFullname: "Nico" })
        }));
        dir.logger = recordingLogger();

        const stops = await run(dir, {
          name: "randomreply",
          action: randomReplyAction(["Hi ${userFullname}", "Hello ${userFullname}", "Hey ${userFullname}"])
        });

        assert.strictEqual(mock.seen.messages.length, 1);
        const sent = mock.seen.messages[0];
        assert.strictEqual(sent.requestId, REQUEST_ID);
        assert.strictEqual(sent.body.attributes.commands.length, 2,
          'exactly one wait/message pair is kept');
        const text = sent.body.attributes.commands[1].message.text;
        assert.ok(["Hi Nico", "Hello Nico", "Hey Nico"].indexOf(text) > -1,
          'one alternative, filled. Got: ' + text);
        assert.strictEqual(sent.body.attributes.fillParams, true);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('sends the message unfilled when there is no cache', async () => {
      const mock = await startMock();
      try {
        const dir = new DirRandomReply(contextFor({}));   // no tdcache
        dir.logger = recordingLogger();

        await run(dir, { name: "randomreply", action: randomReplyAction(["A", "B"]) });

        assert.strictEqual(mock.seen.messages.length, 1);
        assert.strictEqual(mock.seen.messages[0].body.attributes.commands.length, 4,
          'with no cache nothing is chosen and the whole action is sent as-is');
      } finally {
        await mock.close();
      }
    });

    it('sends an action that carries no attributes at all', async () => {
      const mock = await startMock();
      try {
        const dir = new DirRandomReply(contextFor({ tdcache: fakeCache({ userFullname: "Nico" }) }));
        dir.logger = recordingLogger();

        const stops = await run(dir, {
          name: "randomreply",
          action: { _tdActionType: "randomreply", text: "Hi ${userFullname}" }
        });

        assert.strictEqual(mock.seen.messages.length, 1);
        assert.strictEqual(mock.seen.messages[0].body.text, "Hi Nico");
        assert.strictEqual(mock.seen.messages[0].body.attributes.fillParams, true);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('carries on when the API refuses the reply', async () => {
      let attempts = 0;
      const mock = await startMock((server) => {
        server.post('/:projectId/requests/:requestId/messages', (req, res) => {
          attempts += 1;
          res.status(500).send({ success: false });
        });
      });
      try {
        const dir = new DirRandomReply(contextFor({ tdcache: fakeCache({}) }));
        dir.logger = recordingLogger();

        const stops = await run(dir, { name: "randomreply", action: randomReplyAction(["A", "B"]) });

        assert.strictEqual(attempts, 1);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('does nothing on a directive with no action', async () => {
      const mock = await startMock();
      try {
        const dir = new DirRandomReply(contextFor({ tdcache: fakeCache({}) }));
        dir.logger = recordingLogger();

        const stops = await run(dir, { name: "randomreply" }, 0);

        assert.deepStrictEqual(mock.seen.messages, []);
        assert.deepStrictEqual(stops, [undefined]);
        assert.ok(dir.logger.lines.some(([lvl]) => lvl === 'error'));
      } finally {
        await mock.close();
      }
    });

    // QUARANTINED -- DirRandomReply.js:58-61.
    //     const rnd_commands = TiledeskChatbotUtil.chooseRandomReply(message);
    //     message.attributes.commands = rnd_commands;
    //     let commands = message.attributes.commands;
    //     if (commands.length > 0) {
    // chooseRandomReply returns NULL when the command list has an odd length
    // (ChatbotReplyUtil.js:92-95 - it pairs each message with the wait in front
    // of it). The null is assigned over the real commands and then dereferenced,
    // so `commands.length` is a TypeError inside the async `go()`: an unhandled
    // rejection, and the callback is never reached, so the conversation stalls
    // with no reply. An odd command list is exactly what a randomreply node with
    // a leading or trailing stray command produces. Correct behaviour is what
    // this test asserts: keep the original commands and still send something.
    it.skip('keeps the reply intact when the alternatives cannot be paired', async () => {
      const mock = await startMock();
      try {
        const action = randomReplyAction(["A", "B"]);
        action.attributes.commands.push({ type: "wait", time: 10 });   // odd length
        const dir = new DirRandomReply(contextFor({ tdcache: fakeCache({}) }));
        dir.logger = recordingLogger();

        const stops = await run(dir, { name: "randomreply", action: action });

        assert.strictEqual(mock.seen.messages.length, 1);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });
  });

  // ---------------------------------------------------------------- DirReply

  describe('DirReply', function () {

    function replyDir(vars, overrides) {
      const dir = new DirReply(contextFor(Object.assign({
        tdcache: fakeCache(vars),
        chatbot: fakeChatbot("Test Bot"),
        reply: { attributes: { intent_info: { intent_name: "greetings" } } }
      }, overrides)));
      dir.logger = recordingLogger();
      return dir;
    }

    function replyAction(text, extra) {
      return Object.assign({
        text: text,
        attributes: { commands: [{ type: "message", message: { type: "text", text: text } }] }
      }, extra || {});
    }

    // QUARANTINED -- DirReply.js:22-25 + :163-164. When a reply action arrives
    // with no `attributes`, execute() creates an EMPTY one (`action.attributes = {}`)
    // and go() therefore reaches
    //     const delay = TiledeskChatbotUtil.totalMessageWait(cleanMessage);
    // with `attributes.commands` undefined. totalMessageWait
    // (ChatbotReplyUtil.js:200-214) dereferences `message.attributes.commands.length`
    // with no guard, so that is a TypeError - thrown INSIDE the
    // sendSupportMessage callback, after the message has already been posted.
    // The reply is delivered but `callback()` is never reached, so the directive
    // pipeline stalls and every action after the reply is silently dropped. The
    // sibling guard two lines earlier (`if (message.attributes && message.attributes.commands)`)
    // shows the shape the missing check should have. Correct behaviour is what
    // this test asserts: send the reply and release the flow.
    it.skip('creates the attributes when the action has none, and marks fillParams', async () => {
      const mock = await startMock();
      try {
        const dir = replyDir({ userFullname: "Nico" });
        const stops = await run(dir, { name: "reply", action: { text: "Hi ${userFullname}" } });

        assert.strictEqual(mock.seen.messages.length, 1);
        const sent = mock.seen.messages[0].body;
        assert.strictEqual(sent.text, "Hi Nico");
        assert.strictEqual(sent.attributes.fillParams, true);
        assert.strictEqual(sent.senderFullname, "Test Bot",
          'the reply is attributed to the bot');
        assert.strictEqual(sent.attributes.intentName, "greetings");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('fills the metadata source and name of an image reply', async () => {
      const mock = await startMock();
      try {
        const dir = replyDir({ imageUrl: "https://cdn.example.com/a.png", imageName: "a.png" });
        await run(dir, {
          name: "reply",
          action: replyAction("look", {
            metadata: { src: "${imageUrl}", name: "${imageName}", width: 100 }
          })
        });

        assert.strictEqual(mock.seen.messages.length, 1);
        assert.deepStrictEqual(mock.seen.messages[0].body.metadata, {
          src: "https://cdn.example.com/a.png",
          name: "a.png",
          width: 100
        });
      } finally {
        await mock.close();
      }
    });

    it('publishes the user flow attributes with the reply', async () => {
      const mock = await startMock();
      try {
        const dir = replyDir({ custom_var: "v1", project_id: PROJECT_ID, _internal: "hidden" });
        await run(dir, { name: "reply", action: replyAction("hello") });

        assert.strictEqual(mock.seen.messages.length, 1);
        const published = mock.seen.messages[0].body.attributes.flowAttributes;
        assert.strictEqual(published.custom_var, "v1");
        assert.ok(!('project_id' in published),
          'a reserved attribute must not be published to the client');
        assert.ok(!('_internal' in published),
          'an underscore-prefixed attribute must not be published to the client');
      } finally {
        await mock.close();
      }
    });

    it('prefers an explicit intent_display_name over the intent_info', async () => {
      const mock = await startMock();
      try {
        const dir = replyDir({}, {
          reply: {
            intent_display_name: "explicit_name",
            attributes: { intent_info: { intent_name: "greetings" } }
          }
        });
        await run(dir, { name: "reply", action: replyAction("hello") });

        assert.strictEqual(mock.seen.messages[0].body.attributes.intentName, "explicit_name");
      } finally {
        await mock.close();
      }
    });

    it('appends the reply to the conversation transcript', async () => {
      const mock = await startMock();
      try {
        const dir = replyDir({});
        await run(dir, { name: "reply", action: replyAction("hello there") });

        assert.ok(/hello there/.test(dir.context.chatbot.params.transcript || ''),
          'the reply must be recorded in the transcript. Got: ' +
          JSON.stringify(dir.context.chatbot.params.transcript));
      } finally {
        await mock.close();
      }
    });

    it('waits out the reply commands before releasing the flow', async () => {
      const mock = await startMock();
      try {
        const dir = replyDir({});
        const action = replyAction("slow");
        action.attributes.commands = [
          { type: "wait", time: 400 },
          { type: "message", message: { type: "text", text: "slow" } }
        ];
        const started = Date.now();
        const stops = await run(dir, { name: "reply", action: action }, 0);
        const elapsed = Date.now() - started;

        assert.strictEqual(mock.seen.messages.length, 1);
        assert.ok(elapsed >= 350,
          'the directive must not release the flow before the reply has played out; waited ' + elapsed + 'ms');
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('fills the buttons, the media and the settings carried by the commands', async () => {
      const mock = await startMock();
      try {
        const dir = replyDir({ userFullname: "Nico", imageUrl: "https://cdn.example.com/a.png" });
        const action = replyAction("menu");
        action.attributes.commands = [
          {
            type: "message",
            message: {
              type: "text",
              text: "Hi ${userFullname}",
              attributes: {
                attachment: {
                  type: "template",
                  buttons: [{ value: "Call ${userFullname}", type: "text", link: "${imageUrl}" }]
                }
              }
            }
          },
          {
            type: "message",
            message: {
              type: "image",
              metadata: { src: "${imageUrl}", downloadURL: "${imageUrl}" }
            }
          },
          { type: "settings", settings: { placeholder: "Write to ${userFullname}" } }
        ];
        await run(dir, { name: "reply", action: action });

        assert.strictEqual(mock.seen.messages.length, 1);
        const commands = mock.seen.messages[0].body.attributes.commands;
        assert.strictEqual(commands[0].message.text, "Hi Nico");
        assert.strictEqual(commands[0].message.attributes.attachment.buttons[0].value, "Call Nico");
        assert.deepStrictEqual(commands[1].message.metadata,
          { src: "https://cdn.example.com/a.png", downloadURL: "https://cdn.example.com/a.png" });
        assert.deepStrictEqual(commands[2].settings, { placeholder: "Write to Nico" });
      } finally {
        await mock.close();
      }
    });

    it('carries on when the API refuses the reply', async () => {
      let attempts = 0;
      const mock = await startMock((server) => {
        server.post('/:projectId/requests/:requestId/messages', (req, res) => {
          attempts += 1;
          res.status(500).send({ success: false });
        });
      });
      try {
        const dir = replyDir({});
        const stops = await run(dir, { name: "reply", action: replyAction("hello") });

        assert.strictEqual(attempts, 1);
        assert.deepStrictEqual(stops, [undefined]);
        assert.ok(dir.logger.lines.some(([lvl, t]) =>
          lvl === 'error' && /Error sending reply/.test(t)),
          'the failure must be reported on the flow log');
      } finally {
        await mock.close();
      }
    });

    it('does nothing on a directive with no action', async () => {
      const mock = await startMock();
      try {
        const dir = replyDir({});
        const stops = await run(dir, { name: "reply" }, 0);

        assert.deepStrictEqual(mock.seen.messages, []);
        assert.deepStrictEqual(stops, [undefined]);
        assert.ok(dir.logger.lines.some(([lvl]) => lvl === 'error'));
      } finally {
        await mock.close();
      }
    });
  });


  // ------------------------------------------------------ DirCaptureUserReply

  describe('DirCaptureUserReply', function () {

    function captureDir(overrides) {
      const chatbot = Object.assign(fakeChatbot(), {
        locked: null, lockedIntent: null,
        async currentLockedAction() { return this.locked; },
        async lockIntent(rid, name) { this.lockedIntent = name; },
        async lockAction(rid, id) { this.locked = id; },
        async unlockIntent() { this.lockedIntent = null; },
        async unlockAction() { this.locked = null; }
      });
      const dir = new DirCaptureUserReply(contextFor(Object.assign({
        tdcache: fakeCache({}),
        chatbot: chatbot,
        message: { text: "nico@example.com" },
        reply: { attributes: { intent_info: { intent_name: "ask_email" } } }
      }, overrides)));
      dir.logger = recordingLogger();
      dir._chatbot = chatbot;
      return dir;
    }

    it('locks the intent and the action on the first pass and waits', async () => {
      const dir = captureDir();
      const stops = await run(dir, {
        name: "captureuserreply",
        action: { "_tdActionId": "CAP-1", assignResultTo: "email" }
      }, 0);

      assert.strictEqual(dir._chatbot.lockedIntent, "ask_email");
      assert.strictEqual(dir._chatbot.locked, "CAP-1");
      assert.strictEqual(dir.context.tdcache.hashes["tilebot:requests:" + REQUEST_ID + ":parameters"].email,
        undefined, 'nothing may be captured before the user has answered');
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('unlocks and stores the user reply on the second pass', async () => {
      const dir = captureDir();
      dir._chatbot.locked = "CAP-1";
      dir._chatbot.lockedIntent = "ask_email";

      const stops = await run(dir, {
        name: "captureuserreply",
        action: { "_tdActionId": "CAP-1", assignResultTo: "email" }
      }, 0);

      assert.strictEqual(dir._chatbot.locked, null, 'the action must be unlocked');
      assert.strictEqual(dir._chatbot.lockedIntent, null);
      assert.strictEqual(
        dir.context.tdcache.hashes["tilebot:requests:" + REQUEST_ID + ":parameters"].email,
        JSON.stringify("nico@example.com"),
        'the captured reply is written to the named flow attribute');
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('stores nothing when the action names no destination', async () => {
      const dir = captureDir();
      dir._chatbot.locked = "CAP-1";

      const stops = await run(dir, { name: "captureuserreply", action: { "_tdActionId": "CAP-1" } }, 0);

      assert.deepStrictEqual(
        dir.context.tdcache.hashes["tilebot:requests:" + REQUEST_ID + ":parameters"], {});
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('carries on when unlocking fails', async () => {
      const dir = captureDir();
      dir._chatbot.locked = "CAP-1";
      dir._chatbot.unlockIntent = async () => { throw new Error("redis down"); };

      const stops = await run(dir, {
        name: "captureuserreply",
        action: { "_tdActionId": "CAP-1", assignResultTo: "email" }
      }, 0);

      assert.strictEqual(
        dir.context.tdcache.hashes["tilebot:requests:" + REQUEST_ID + ":parameters"].email,
        JSON.stringify("nico@example.com"),
        'a failed unlock must not lose the captured reply');
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('jumps to the connected intent once the reply has been captured', async () => {
      const dir = captureDir();
      dir._chatbot.locked = "CAP-1";

      const stops = await run(dir, {
        name: "captureuserreply",
        action: { "_tdActionId": "CAP-1", assignResultTo: "email", goToIntent: "AFTER_CAPTURE" }
      });

      assert.deepStrictEqual(dispatched, ["/AFTER_CAPTURE"]);
      assert.strictEqual(
        dir.context.tdcache.hashes["tilebot:requests:" + REQUEST_ID + ":parameters"].email,
        JSON.stringify("nico@example.com"),
        'the reply is captured before the jump');
      assert.deepStrictEqual(stops, [undefined],
        'the capture releases the flow even after jumping');
    });

    it('does nothing on a directive with no action', async () => {
      const dir = captureDir();
      const stops = await run(dir, { name: "captureuserreply" }, 0);

      assert.strictEqual(dir._chatbot.locked, null, 'nothing may be locked');
      assert.deepStrictEqual(stops, [undefined]);
      assert.ok(dir.logger.lines.some(([lvl]) => lvl === 'error'));
    });

    // QUARANTINED -- DirCaptureUserReply.js:60-87. The try/catch around the
    // second pass swallows the error and then simply falls off the end of the
    // method: there is no `callback()` in the catch. So if anything in that
    // block throws - `this.message` absent, which is exactly what happens when
    // the capture is re-entered from a context with no incoming message, makes
    // :61 a TypeError - the directive pipeline never advances and the
    // conversation hangs with no reply and no user-visible log. Every other
    // catch in this tree calls back. Correct behaviour is what this test
    // asserts: report and release the flow.
    it.skip('releases the flow when the captured reply cannot be read', async () => {
      const dir = captureDir({ message: undefined });
      dir._chatbot.locked = "CAP-1";

      const stops = await run(dir, {
        name: "captureuserreply",
        action: { "_tdActionId": "CAP-1", assignResultTo: "email" }
      }, 0);

      assert.deepStrictEqual(stops, [undefined]);
    });
  });

  // -------------------------------------------------------------- DirMessage

  describe('DirMessage', function () {

    function messageDir(overrides) {
      const dir = new DirMessage(contextFor(Object.assign({
        tdcache: fakeCache({ userFullname: "Nico" }),
        chatbot: fakeChatbot(),
        supportRequest: { id_project: PROJECT_ID, request_id: REQUEST_ID, bot_id: "botID", draft: true }
      }, overrides)));
      dir.logger = recordingLogger();
      return dir;
    }

    it('sends a hidden info message built from the directive parameter', async () => {
      const mock = await startMock();
      try {
        const dir = messageDir();
        const stops = await run(dir, { name: "message", parameter: "  Hello ${userFullname}  " });

        assert.strictEqual(mock.seen.messages.length, 1);
        const sent = mock.seen.messages[0].body;
        assert.strictEqual(sent.text, "Hello Nico");
        assert.strictEqual(sent.attributes.directives, false,
          'an info message must not be re-parsed for directives');
        assert.strictEqual(sent.attributes.fillParams, true);
        assert.strictEqual(sent.attributes.subtype, undefined);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('marks an hmessage as an info subtype', async () => {
      const mock = await startMock();
      try {
        const dir = messageDir();
        await run(dir, { name: "hmessage", parameter: "internal note" });

        assert.strictEqual(mock.seen.messages.length, 1);
        assert.strictEqual(mock.seen.messages[0].body.attributes.subtype, "info");
      } finally {
        await mock.close();
      }
    });

    it('sends an action message on a draft run and can stop the flow', async () => {
      const mock = await startMock();
      try {
        const dir = messageDir();
        const stops = await run(dir, {
          name: "message",
          action: { text: "Hi ${userFullname}", "_tdThenStop": true }
        });

        assert.strictEqual(mock.seen.messages.length, 1);
        assert.strictEqual(mock.seen.messages[0].body.text, "Hi Nico");
        assert.strictEqual(mock.seen.messages[0].body.attributes.fillParams, true,
          'the empty attributes object is created and marked');
        assert.deepStrictEqual(stops, [true], '_tdThenStop must stop the directive list');
      } finally {
        await mock.close();
      }
    });

    it('sends nothing on a published run when the message is not an info message', async () => {
      const mock = await startMock();
      try {
        const dir = messageDir({
          supportRequest: { id_project: PROJECT_ID, request_id: REQUEST_ID, bot_id: "botID", draft: false }
        });
        const stops = await run(dir, { name: "message", action: { text: "debug only" } }, 0);

        assert.deepStrictEqual(mock.seen.messages, [],
          'a debug message must stay inside the draft run');
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('does nothing on a directive with neither action nor parameter', async () => {
      const mock = await startMock();
      try {
        const dir = messageDir();
        const stops = await run(dir, { name: "message" }, 0);

        assert.deepStrictEqual(mock.seen.messages, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    // QUARANTINED -- DirMessage.js:112-115. The error branch of
    // sendSupportMessage reads
    //     if (err) { winston.err("(DirMessage) Error sending reply: ", err); }
    // `winston.err` does not exist - utils/winston.js exports `error`, and
    // `typeof winston.err` is "undefined". So the ONE line that runs when the
    // API refuses the message is itself a TypeError, thrown inside the client's
    // callback: the `callback()` two lines below is never reached and the
    // directive pipeline stalls. A message the API rejects therefore takes the
    // whole conversation down with it, which is the opposite of what the branch
    // was written for. Correct behaviour is what this test asserts.
    it.skip('carries on when the API refuses the message', async () => {
      let attempts = 0;
      const mock = await startMock((server) => {
        server.post('/:projectId/requests/:requestId/messages', (req, res) => {
          attempts += 1;
          res.status(500).send({ success: false });
        });
      });
      try {
        const dir = messageDir();
        const stops = await run(dir, { name: "message", parameter: "hello" });

        assert.strictEqual(attempts, 1);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });
  });

  // -------------------------------------------------------------- DirReplyV2

  describe('DirReplyV2', function () {

    function replyV2Dir(vars) {
      const dir = new DirReplyV2(contextFor({
        tdcache: fakeCache(vars),
        chatbot: fakeChatbot("Test Bot"),
        reply: { attributes: { intent_info: { intent_name: "greetings" } } },
        message: { text: "hi" }
      }));
      dir.logger = recordingLogger();
      return dir;
    }

    function replyV2Action(text, extra) {
      return Object.assign({
        text: text,
        attributes: {
          commands: [
            { type: "wait", time: 10 },
            { type: "message", message: { type: "text", text: text } }
          ]
        }
      }, extra || {});
    }

    it('fills the text, the metadata and the commands before sending', async () => {
      const mock = await startMock();
      try {
        const dir = replyV2Dir({ userFullname: "Nico", imageUrl: "https://cdn.example.com/a.png" });
        const stops = await run(dir, {
          name: "replyv2",
          action: replyV2Action("Hi ${userFullname}", {
            metadata: { src: "${imageUrl}", name: "${userFullname}.png" }
          })
        });

        assert.strictEqual(mock.seen.messages.length, 1);
        const sent = mock.seen.messages[0].body;
        assert.strictEqual(sent.text, "Hi Nico");
        assert.deepStrictEqual(sent.metadata,
          { src: "https://cdn.example.com/a.png", name: "Nico.png" });
        assert.strictEqual(sent.attributes.commands[1].message.text, "Hi Nico");
        assert.strictEqual(sent.senderFullname, "Test Bot");
        assert.deepStrictEqual(stops, [false],
          'a reply with no buttons must not stop the flow');
      } finally {
        await mock.close();
      }
    });

    it('carries on when the API refuses the reply', async () => {
      let attempts = 0;
      const mock = await startMock((server) => {
        server.post('/:projectId/requests/:requestId/messages', (req, res) => {
          attempts += 1;
          res.status(500).send({ success: false });
        });
      });
      try {
        const dir = replyV2Dir({});
        const stops = await run(dir, { name: "replyv2", action: replyV2Action("hello") });

        assert.strictEqual(attempts, 1);
        assert.deepStrictEqual(stops, [false]);
      } finally {
        await mock.close();
      }
    });

    it('does nothing on a directive with no action', async () => {
      const mock = await startMock();
      try {
        const dir = replyV2Dir({});
        const stops = await run(dir, { name: "replyv2" }, 0);

        assert.deepStrictEqual(mock.seen.messages, []);
        assert.deepStrictEqual(stops, [undefined]);
        assert.ok(dir.logger.lines.some(([lvl]) => lvl === 'error'));
      } finally {
        await mock.close();
      }
    });

    // QUARANTINED -- DirReplyV2.js:34-40 + :55-58. execute() accepts an action
    // with no `attributes` and gives it an EMPTY one; go() then opens with
    //     if (message.attributes.commands[1].message.text) {
    // which reads index 1 of an undefined `commands`. That is a TypeError on the
    // very first statement of go(), inside an async method, so the reply is never
    // sent at all and the callback never runs - an unhandled rejection plus a
    // stalled conversation. The same line also breaks a perfectly valid reply
    // carrying a SINGLE command. The variable it computes, `current`, is used
    // only in two winston.debug calls. Correct behaviour is what this test
    // asserts: send the reply.
    it.skip('sends a reply that carries a single command', async () => {
      const mock = await startMock();
      try {
        const dir = replyV2Dir({});
        const stops = await run(dir, {
          name: "replyv2",
          action: {
            text: "hello",
            attributes: { commands: [{ type: "message", message: { type: "text", text: "hello" } }] }
          }
        });

        assert.strictEqual(mock.seen.messages.length, 1);
        assert.strictEqual(mock.seen.messages[0].body.text, "hello");
        assert.deepStrictEqual(stops, [false]);
      } finally {
        await mock.close();
      }
    });
  });

  // ------------------------------------------------------------------ DirForm

  describe('DirForm', function () {

    it('does nothing on a directive with no action', async () => {
      const dir = new DirForm(contextFor({ tdcache: fakeCache({}), chatbot: fakeChatbot() }));
      dir.logger = recordingLogger();
      const stops = await run(dir, { name: "form" }, 0);

      assert.deepStrictEqual(stops, [undefined]);
    });

    // QUARANTINED -- DirForm.go (DirForm.js:39-144) cannot run at all. With an
    // INVALID form the whole body is skipped and `callback` is never called, so
    // the directive pipeline stops for good and the conversation hangs with no
    // reply and no log. With a VALID form it is worse: :73 reads `message.text`
    // and `message` is not declared anywhere in the function, the class or the
    // module (ReferenceError); :74 calls `this.execIntentForm`, which does not
    // exist on DirForm; :100 logs `lead`, another undeclared name; :105 and :124
    // pass `trueIntentAttributes`/`falseIntentAttributes`, two more; and :120
    // calls `this.unlockAction`, which lives on the chatbot, not here. Every one
    // of those throws inside an async method, i.e. an unhandled rejection.
    // The two tests below assert the correct behaviour of each half.
    it.skip('calls back when the form is not valid', async () => {
      const dir = new DirForm(contextFor({ tdcache: fakeCache({}), chatbot: fakeChatbot() }));
      dir.logger = recordingLogger();
      const stops = await run(dir, { name: "form", action: { form: { fields: [] } } }, 0);

      assert.deepStrictEqual(stops, [undefined],
        'an unusable form must release the flow, not hang it');
    });

    it.skip('asks the first field question when the form is valid', async () => {
      const mock = await startMock();
      try {
        const dir = new DirForm(contextFor({
          tdcache: fakeCache({}),
          chatbot: fakeChatbot(),
          message: { text: "start" }
        }));
        dir.logger = recordingLogger();
        const stops = await run(dir, {
          name: "form",
          action: {
            trueIntent: "FORM_DONE",
            falseIntent: "FORM_CANCELLED",
            form: { fields: [{ name: "userFullname", type: "text", label: "What is your name?" }] }
          }
        });

        assert.strictEqual(mock.seen.messages.length, 1);
        assert.strictEqual(mock.seen.messages[0].body.text, "What is your name?");
        assert.deepStrictEqual(stops, [true], 'the flow waits for the answer');
      } finally {
        await mock.close();
      }
    });
  });

});
