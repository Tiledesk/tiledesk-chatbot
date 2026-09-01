var assert = require('assert');
var express = require('express');
const bodyParser = require('body-parser');
const { DirReplaceBot } = require('../directives/bot/DirReplaceBot');
const { DirReplaceBotV2 } = require('../directives/bot/DirReplaceBotV2');
const { DirReplaceBotV3 } = require('../directives/bot/DirReplaceBotV3');
const { DirRemoveCurrentBot } = require('../directives/bot/DirRemoveCurrentBot');

// Three things in directives/bot cannot be reached through a designer flow and
// are driven directly here, against a real mock API on 10002:
//
//  * the `directive.parameter` branch of DirReplaceBot and DirRemoveCurrentBot
//    (Directives.actionToDirective only ever produces { name, action });
//  * the published-run analytics branch of DirReplaceBotV2/V3, which reads
//    `context.chatbot.bot.root_id` -- the test harness's MockBotsDataSource
//    rebuilds the bot from four fields and drops root_id, so a flow can never
//    take it;
//  * the hidden-message failure branch of DirReplaceBotV2/V3, where the reply
//    endpoint answers non-2xx.

const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:10002';
const PROJECT_ID = "projectID";
const REQUEST_ID = "A-REQUEST-ID";
const MOCK_PORT = 10002;

/** Minimal cache double: one flow attribute, stored the way the cache stores it. */
function cacheWith(attributes) {
  return {
    hgetall: async () => {
      const out = {};
      for (const [k, v] of Object.entries(attributes)) out[k] = JSON.stringify(v);
      return out;
    }
  };
}

function contextFor(overrides) {
  return Object.assign({
    projectId: PROJECT_ID,
    token: "XXX",
    API_ENDPOINT: API_ENDPOINT,
    requestId: REQUEST_ID,
    tdcache: cacheWith({ bot_var: "Filled Bot", block_var: "filled_block" }),
    reply: { attributes: { intent_info: { intent_name: "an_intent" } } }
  }, overrides);
}

/** Starts a mock API. `routes(server, calls)` registers what the test needs. */
function startMock(routes) {
  return new Promise((resolve) => {
    const calls = [];
    const server = express();
    server.use(bodyParser.json());
    routes(server, calls);
    const listener = server.listen(MOCK_PORT, '0.0.0.0', () => {
      resolve({ calls: calls, close: () => new Promise((r) => listener.close(() => r())) });
    });
  });
}

/** Runs a directive and resolves with how many times its callback fired. */
function run(dir, directive) {
  return new Promise((resolve) => {
    let called = 0;
    dir.execute(directive, () => {
      called += 1;
      // Give a stray second call a chance to arrive before the test asserts.
      if (called === 1) setTimeout(() => resolve(called), 150);
    });
  });
}

describe('Directives directives/bot, paths a flow cannot reach', function () {

  it('DirReplaceBotV2 on a published bot tracks the switch and survives a failing hidden message', async () => {
    let replaceBody = null;
    let hidden = null;
    const mock = await startMock((server) => {
      server.put('/:projectId/requests/:requestId/replace', (req, res) => {
        replaceBody = req.body;
        res.status(200).send({ success: true, replaced_bot_root_id: "NEW-ROOT" });
      });
      server.post('/:projectId/requests/:requestId/messages', (req, res) => {
        hidden = req.body;
        // The hidden "/block" message fails: the directive must log and go on.
        res.status(500).send({ success: false });
      });
    });
    try {
      const dir = new DirReplaceBotV2(contextFor({
        chatbot: { bot: { root_id: "ROOT-1" } }
      }));
      const called = await run(dir, {
        name: "replacebotv2",
        action: { botName: "{{bot_var}}", blockName: "go_here" }
      });

      assert.deepStrictEqual(replaceBody, { name: "Filled Bot" },
        'botName must be filled from the flow attributes before the request is built');
      assert.deepStrictEqual(hidden, {
        type: "text",
        text: "/go_here",
        attributes: { subtype: "info" }
      });
      assert.strictEqual(called, 1,
        'A failing hidden message must still end the directive exactly once');
    } finally {
      await mock.close();
    }
  });

  it('DirReplaceBotV3 on a published bot tracks the switch and survives a failing hidden message', async () => {
    let replaceBody = null;
    let hidden = null;
    const mock = await startMock((server) => {
      server.put('/:projectId/requests/:requestId/replace', (req, res) => {
        replaceBody = req.body;
        res.status(200).send({ success: true, replaced_bot_root_id: "NEW-ROOT" });
      });
      server.post('/:projectId/requests/:requestId/messages', (req, res) => {
        hidden = req.body;
        res.status(500).send({ success: false });
      });
    });
    try {
      const dir = new DirReplaceBotV3(contextFor({
        chatbot: { bot: { root_id: "ROOT-1" } }
      }));
      const called = await run(dir, {
        name: "replacebotv3",
        action: { botId: "BOT-3", botSlug: "{{bot_var}}", blockName: "{{block_var}}" }
      });

      assert.deepStrictEqual(replaceBody, { id: "BOT-3" });
      assert.strictEqual(hidden.text, "/filled_block");
      assert.strictEqual(called, 1);
    } finally {
      await mock.close();
    }
  });

  it('DirReplaceBot accepts the bot name as a directive parameter and trims it', async () => {
    const mock = await startMock((server, calls) => {
      server.get('/:projectId/faq_kb', (req, res) => {
        calls.push('list-bots');
        res.status(200).send([{ _id: "BOT-2-ID", name: "Second Bot" }]);
      });
      server.get('/:projectId/requests/:requestId', (req, res) => {
        calls.push('get-request');
        res.status(200).send({ request_id: req.params.requestId, participantsBots: [] });
      });
      server.post('/:projectId/requests/:requestId/participants', (req, res) => {
        calls.push('add-participant:' + req.body.member);
        res.status(200).send({ success: true });
      });
    });
    try {
      const dir = new DirReplaceBot(contextFor({}));
      const called = await run(dir, { name: "replacebot", parameter: "   Second Bot   " });

      // The untrimmed parameter would not match any bot name.
      assert.deepStrictEqual(mock.calls, [
        'list-bots', 'get-request', 'add-participant:bot_BOT-2-ID'
      ]);
      assert.strictEqual(called, 1);
    } finally {
      await mock.close();
    }
  });

  it('DirRemoveCurrentBot accepts a directive parameter instead of an action', async () => {
    let patchBody = null;
    const mock = await startMock((server, calls) => {
      server.get('/:projectId/requests/:requestId', (req, res) => {
        calls.push('get-request');
        res.status(200).send({ request_id: req.params.requestId, participantsBots: ["BOT-9"] });
      });
      server.delete('/:projectId/requests/:requestId/participants/:participantId', (req, res) => {
        calls.push('delete-participant:' + req.params.participantId);
        res.status(200).send({ success: true });
      });
      server.patch('/:projectId/requests/:requestId', (req, res) => {
        calls.push('patch-request');
        patchBody = req.body;
        res.status(200).send({ success: true });
      });
    });
    try {
      const dir = new DirRemoveCurrentBot(contextFor({}));
      const called = await run(dir, { name: "removecurrentbot", parameter: "anything" });

      assert.deepStrictEqual(mock.calls, [
        'get-request', 'delete-participant:bot_BOT-9', 'patch-request'
      ]);
      assert.deepStrictEqual(patchBody, { status: 50 });
      assert.strictEqual(called, 1);
    } finally {
      await mock.close();
    }
  });

  // QUARANTINED -- these three assert the CORRECT behaviour and are red today.
  //
  // DirReplaceBot.execute (directives/bot/DirReplaceBot.js:31-35),
  // DirReplaceBotV2.execute (:31-35) and DirRemoveCurrentBot.execute (:26-29)
  // call `callback()` on a directive that has neither an action nor a parameter
  // and then FALL THROUGH to `this.go(action, ...)` with `action` undefined --
  // the `return` that DirReplaceBotV3.execute (:25-30) has is missing.
  //
  // The two consequences differ:
  //   * DirReplaceBot / DirReplaceBotV2: `go` is async and dereferences
  //     `action.botName`, so the TypeError becomes an UNHANDLED PROMISE
  //     REJECTION -- process-fatal under Node's default
  //     --unhandled-rejections=throw.
  //   * DirRemoveCurrentBot: `go` never reads `action`, so it runs to completion
  //     and the callback fires a SECOND time, making DirectivesChatbotPlug walk
  //     the rest of the directive list twice.
  //
  // Un-skip once each `callback()` in those else-branches is followed by
  // `return`.
  it.skip('DirReplaceBot calls back once and does nothing on a directive with neither action nor parameter', async () => {
    const dir = new DirReplaceBot(contextFor({}));
    const called = await run(dir, { name: "replacebot" });
    assert.strictEqual(called, 1);
  });

  it.skip('DirReplaceBotV2 calls back once and does nothing on a directive with neither action nor parameter', async () => {
    const dir = new DirReplaceBotV2(contextFor({}));
    const called = await run(dir, { name: "replacebotv2" });
    assert.strictEqual(called, 1);
  });

  it.skip('DirRemoveCurrentBot calls back once on a directive with neither action nor parameter', async () => {
    const mock = await startMock((server) => {
      server.get('/:projectId/requests/:requestId', (req, res) => {
        res.status(200).send({ request_id: req.params.requestId, participantsBots: ["BOT-9"] });
      });
      server.delete('/:projectId/requests/:requestId/participants/:participantId', (req, res) => {
        res.status(200).send({ success: true });
      });
      server.patch('/:projectId/requests/:requestId', (req, res) => {
        res.status(200).send({ success: true });
      });
    });
    try {
      const dir = new DirRemoveCurrentBot(contextFor({}));
      const called = await run(dir, { name: "removecurrentbot" });
      assert.strictEqual(called, 1, 'The callback must not fire twice');
    } finally {
      await mock.close();
    }
  });

});
