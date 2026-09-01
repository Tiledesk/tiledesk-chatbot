var assert = require('assert');
var express = require('express');
const bodyParser = require('body-parser');
const { DirFireTiledeskEvent } = require('../directives/tiledesk/DirFireTiledeskEvent');

// DirFireTiledeskEvent is reached with a `parameter`, never with an `action`:
// Directives.actionToDirective() only ever produces { name, action }, so a
// designer block can only ever take the directive's "no parameter" branch.
// The parameter form is therefore driven directly here, against a mock API on
// 10002 -- the same port and the same real HTTP the conversation tests use, so
// the url, method, headers and body the directive builds are all asserted.

const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:10002';
const PROJECT_ID = "projectID";
const REQUEST_ID = "A-REQUEST-ID";
const MOCK_PORT = 10002;

function contextFor() {
  return {
    projectId: PROJECT_ID,
    token: "XXX",
    API_ENDPOINT: API_ENDPOINT,
    requestId: REQUEST_ID,
    log: false
  };
}

/**
 * Starts a mock API that records every POST on /{projectId}/events and answers
 * with `status`. Resolves with { received, close } where `received` is filled in
 * as the requests arrive.
 */
function startEventsMock(status, body) {
  return new Promise((resolve) => {
    const received = [];
    const server = express();
    server.use(bodyParser.json());
    server.post('/:projectId/events', function (req, res) {
      received.push({
        projectId: req.params.projectId,
        authorization: req.headers.authorization,
        contentType: req.headers['content-type'],
        body: req.body
      });
      res.status(status).send(body);
    });
    const listener = server.listen(MOCK_PORT, '0.0.0.0', () => {
      resolve({
        received: received,
        close: () => new Promise((r) => listener.close(() => r()))
      });
    });
  });
}

describe('Directive DirFireTiledeskEvent', function () {

  it('fires the event with POST /{projectId}/events, short -n/-p options', async () => {
    const mock = await startEventsMock(200, { success: true });
    try {
      const dir = new DirFireTiledeskEvent(contextFor());
      await new Promise((resolve) => {
        dir.execute({ name: "firetiledeskevent", parameter: '-n order_created -p ORDER-42' }, resolve);
      });

      assert.strictEqual(mock.received.length, 1, 'Expected exactly one POST on /{projectId}/events');
      const req = mock.received[0];
      assert.strictEqual(req.projectId, PROJECT_ID);
      assert.ok(req.authorization, 'Expect an "Authorization" header');
      assert.strictEqual(req.contentType, 'application/json');
      assert.strictEqual(req.body.name, 'order_created');
      assert.strictEqual(req.body.attributes, 'ORDER-42');
    } finally {
      await mock.close();
    }
  });

  it('accepts the long --name/--payload options', async () => {
    const mock = await startEventsMock(200, { success: true });
    try {
      const dir = new DirFireTiledeskEvent(contextFor());
      await new Promise((resolve) => {
        dir.execute({ name: "firetiledeskevent", parameter: '--name cart_abandoned --payload "two words"' }, resolve);
      });

      assert.strictEqual(mock.received.length, 1);
      assert.strictEqual(mock.received[0].body.name, 'cart_abandoned');
      // parseArgsStringToArgv keeps a quoted value as a single argument.
      assert.strictEqual(mock.received[0].body.attributes, 'two words');
    } finally {
      await mock.close();
    }
  });

  it('fires an event with a null name when the parameter carries no -n/--name', async () => {
    const mock = await startEventsMock(200, { success: true });
    try {
      const dir = new DirFireTiledeskEvent(contextFor());
      await new Promise((resolve) => {
        dir.execute({ name: "firetiledeskevent", parameter: '-p only-a-payload' }, resolve);
      });

      // No name is NOT treated as an error by the directive: it posts anyway.
      assert.strictEqual(mock.received.length, 1);
      assert.strictEqual(mock.received[0].body.name, null);
      assert.strictEqual(mock.received[0].body.attributes, 'only-a-payload');
    } finally {
      await mock.close();
    }
  });

  it('calls back without firing anything when the directive has no parameter', async () => {
    const mock = await startEventsMock(200, { success: true });
    try {
      const dir = new DirFireTiledeskEvent(contextFor());
      let called = 0;
      await new Promise((resolve) => {
        dir.execute({ name: "firetiledeskevent" }, () => { called += 1; resolve(); });
      });

      assert.strictEqual(called, 1, 'The callback must be invoked exactly once');
      assert.strictEqual(mock.received.length, 0, 'No event must be posted without a parameter');
    } finally {
      await mock.close();
    }
  });

  it('still calls back when the events API answers non-2xx', async () => {
    const mock = await startEventsMock(500, { success: false, msg: "boom" });
    try {
      const dir = new DirFireTiledeskEvent(contextFor());
      let called = 0;
      await new Promise((resolve) => {
        dir.execute({ name: "firetiledeskevent", parameter: '-n will_fail -p X' }, () => { called += 1; resolve(); });
      });

      assert.strictEqual(mock.received.length, 1, 'The request is still sent');
      // The error is logged and swallowed: the flow must not stall on it.
      assert.strictEqual(called, 1, 'The callback must be invoked exactly once on an API error');
    } finally {
      await mock.close();
    }
  });

  it('still calls back when the events endpoint is unreachable', async () => {
    // Nothing is listening on 10002 for this test: a transport failure, not a
    // status code. The directive must not leave the flow hanging.
    const dir = new DirFireTiledeskEvent(contextFor());
    let called = 0;
    await new Promise((resolve) => {
      dir.execute({ name: "firetiledeskevent", parameter: '-n unreachable -p X' }, () => { called += 1; resolve(); });
    });
    assert.strictEqual(called, 1, 'The callback must be invoked exactly once on a transport error');
  });

  describe('parseParams()', function () {
    it('reads name/payload from either the short or the long option', function () {
      const dir = new DirFireTiledeskEvent(contextFor());
      assert.deepStrictEqual(dir.parseParams('-n a -p b'), { name: 'a', payload: 'b' });
      assert.deepStrictEqual(dir.parseParams('--name a --payload b'), { name: 'a', payload: 'b' });
      // The long form is read last and therefore wins over the short one.
      assert.deepStrictEqual(dir.parseParams('-n short --name long'), { name: 'long', payload: null });
      assert.deepStrictEqual(dir.parseParams(''), { name: null, payload: null });
    });
  });

});
