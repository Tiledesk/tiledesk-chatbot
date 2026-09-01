var assert = require('assert');
var express = require('express');
const bodyParser = require('body-parser');
const { DirDeflectToHelpCenter } = require('../directives/agents/DirDeflectToHelpCenter');

// DirDeflectToHelpCenter is driven directly rather than through a flow, for one
// reason: go() points the Help Center client at `this.helpcenter_api_endpoint`,
// a field NOTHING ever assigns (the context carries HELP_CENTER_API_ENDPOINT).
// Through a flow the directive therefore always talks to the hardcoded default
// host, https://tiledesk-cms-server-prod.herokuapp.com -- see the report. Here
// the field is set on the instance so the search actually reaches the mock and
// the request the directive builds can be asserted.

const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:10002';
const PROJECT_ID = "projectID";
const REQUEST_ID = "A-REQUEST-ID";
const MOCK_PORT = 10002;
const DEFAULT_HC_REPLY =
  "No matching reply but...\n\nI found something interesting in the Help Center 🧐\n\nTake a look 👇";

/** Cache double holding just the one attribute the directive reads. */
function cacheWithLastUserText(text) {
  return {
    hget: async (key, field) => (field === 'last_user_text' ? JSON.stringify(text) : null)
  };
}

function contextFor(lastUserText) {
  return {
    projectId: PROJECT_ID,
    token: "XXX",
    API_ENDPOINT: API_ENDPOINT,
    requestId: REQUEST_ID,
    tdcache: cacheWithLastUserText(lastUserText)
  };
}

function startMock(routes) {
  return new Promise((resolve) => {
    const seen = {};
    const server = express();
    server.use(bodyParser.json());
    routes(server, seen);
    const listener = server.listen(MOCK_PORT, '0.0.0.0', () => {
      resolve({ seen: seen, close: () => new Promise((r) => listener.close(() => r())) });
    });
  });
}

/** Runs the directive and resolves with every `stop` value its callback saw,
 *  settling 250ms after the first call so a second one is not missed. */
function run(dir, directive) {
  return new Promise((resolve) => {
    const stops = [];
    dir.execute(directive, (stop) => {
      stops.push(stop);
      if (stops.length === 1) setTimeout(() => resolve(stops), 250);
    });
  });
}

/** A directive instance already pointed at the mock Help Center. */
function directiveFor(lastUserText) {
  const dir = new DirDeflectToHelpCenter(contextFor(lastUserText));
  dir.helpcenter_api_endpoint = 'http://localhost:' + MOCK_PORT;
  return dir;
}

describe('Directive DirDeflectToHelpCenter', function () {

  it('searches the configured workspace and replies with one url button per result', async () => {
    const mock = await startMock((server, seen) => {
      server.get('/:projectId/:workspaceId/contents/search', (req, res) => {
        seen.search = { params: req.params, query: req.query };
        res.status(200).send([
          { title: "How to reset a password", url: "https://help.example.com/reset" },
          { title: "Billing FAQ", url: "https://help.example.com/billing" }
        ]);
      });
      server.post('/:projectId/requests/:requestId/messages', (req, res) => {
        seen.message = req.body;
        res.status(200).send({ success: true });
      });
      server.get('/:projectId/workspaces/', (req, res) => {
        seen.listedWorkspaces = true;
        res.status(200).send([{ _id: "WS-OTHER" }]);
      });
    });
    try {
      const dir = directiveFor("how do I reset my password");
      const stops = await run(dir, {
        name: "askhelpcenter",
        action: {
          workspaceId: "WS-1",
          hcReply: "Here is what I found:",
          maxresults: 5,
          urlTarget: "self"
        }
      });

      assert.ok(!mock.seen.listedWorkspaces,
        'A configured workspaceId must not trigger a workspace listing');
      assert.strictEqual(mock.seen.search.params.workspaceId, "WS-1");
      assert.strictEqual(mock.seen.search.params.projectId, PROJECT_ID);
      assert.strictEqual(mock.seen.search.query.text, "how do I reset my password");
      assert.strictEqual(mock.seen.search.query.maxresults, "5");

      const message = mock.seen.message;
      assert.strictEqual(message.text, "Here is what I found:");
      assert.strictEqual(message.attributes.disableInputMessage, false);
      assert.strictEqual(message.attributes.commands.length, 2);
      assert.deepStrictEqual(message.attributes.commands[0], { type: "wait", time: 0 });
      const inner = message.attributes.commands[1].message;
      assert.strictEqual(inner.text, "Here is what I found:");
      assert.deepStrictEqual(inner.attributes.attachment.buttons, [
        { type: "url", value: "How to reset a password", link: "https://help.example.com/reset", target: "self" },
        { type: "url", value: "Billing FAQ", link: "https://help.example.com/billing", target: "self" }
      ]);

      assert.deepStrictEqual(stops, [true],
        'A delivered Help Center reply stops the directive chain, exactly once');
    } finally {
      await mock.close();
    }
  });

  it('falls back to the first workspace, the default reply, 3 results and target "blank"', async () => {
    const mock = await startMock((server, seen) => {
      server.get('/:projectId/workspaces/', (req, res) => {
        seen.workspacesPath = req.params.projectId;
        res.status(200).send([{ _id: "WS-FIRST" }, { _id: "WS-SECOND" }]);
      });
      server.get('/:projectId/:workspaceId/contents/search', (req, res) => {
        seen.search = { params: req.params, query: req.query };
        res.status(200).send([{ title: "Getting started", url: "https://help.example.com/start" }]);
      });
      server.post('/:projectId/requests/:requestId/messages', (req, res) => {
        seen.message = req.body;
        res.status(200).send({ success: true });
      });
    });
    try {
      const dir = directiveFor("getting started");
      const stops = await run(dir, { name: "askhelpcenter", action: {} });

      assert.strictEqual(mock.seen.workspacesPath, PROJECT_ID);
      assert.strictEqual(mock.seen.search.params.workspaceId, "WS-FIRST",
        'With no workspaceId configured the FIRST workspace is used');
      assert.strictEqual(mock.seen.search.query.maxresults, "3", 'default maxresults');
      assert.strictEqual(mock.seen.message.text, DEFAULT_HC_REPLY, 'default hcReply');
      assert.strictEqual(
        mock.seen.message.attributes.commands[1].message.attributes.attachment.buttons[0].target,
        "blank", 'default url target');
      assert.deepStrictEqual(stops, [true]);
    } finally {
      await mock.close();
    }
  });

  it('sends nothing and does not stop the flow when the Help Center has no match', async () => {
    const mock = await startMock((server, seen) => {
      server.get('/:projectId/:workspaceId/contents/search', (req, res) => {
        seen.searched = true;
        res.status(200).send({ empty: true });   // 2xx, but no results
      });
      server.post('/:projectId/requests/:requestId/messages', (req, res) => {
        seen.message = req.body;
        res.status(200).send({ success: true });
      });
    });
    try {
      const dir = directiveFor("something nobody wrote about");
      const stops = await run(dir, { name: "askhelpcenter", action: { workspaceId: "WS-1" } });

      assert.ok(mock.seen.searched);
      assert.strictEqual(mock.seen.message, undefined, 'No reply may be sent with no results');
      assert.deepStrictEqual(stops, [false], 'The flow carries on to the next directive');
    } finally {
      await mock.close();
    }
  });

  it('sends nothing and does not stop the flow when the search call fails', async () => {
    const mock = await startMock((server, seen) => {
      server.get('/:projectId/:workspaceId/contents/search', (req, res) => {
        res.status(500).send({ success: false });
      });
      server.post('/:projectId/requests/:requestId/messages', (req, res) => {
        seen.message = req.body;
        res.status(200).send({ success: true });
      });
    });
    try {
      const dir = directiveFor("anything");
      const stops = await run(dir, { name: "askhelpcenter", action: { workspaceId: "WS-1" } });

      assert.strictEqual(mock.seen.message, undefined);
      assert.deepStrictEqual(stops, [false]);
    } finally {
      await mock.close();
    }
  });

  it('never touches the Help Center when there is no last user text', async () => {
    const mock = await startMock((server, seen) => {
      server.get('/:projectId/:workspaceId/contents/search', (req, res) => {
        seen.searched = true;
        res.status(200).send([]);
      });
      server.get('/:projectId/workspaces/', (req, res) => {
        seen.listedWorkspaces = true;
        res.status(200).send([]);
      });
    });
    try {
      const dir = directiveFor("   ");
      const stops = await run(dir, { name: "askhelpcenter", action: { workspaceId: "WS-1" } });

      assert.ok(!mock.seen.searched, 'A blank user text must not be searched for');
      assert.ok(!mock.seen.listedWorkspaces);
      assert.deepStrictEqual(stops, [false]);
    } finally {
      await mock.close();
    }
  });

  it('searches the project configured on the action rather than the conversation project', async () => {
    const mock = await startMock((server, seen) => {
      server.get('/:projectId/:workspaceId/contents/search', (req, res) => {
        seen.search = req.params;
        res.status(200).send([{ title: "T", url: "https://help.example.com/t" }]);
      });
      server.post('/:projectId/requests/:requestId/messages', (req, res) => {
        seen.messageProject = req.params.projectId;
        res.status(200).send({ success: true });
      });
    });
    try {
      const dir = directiveFor("anything");
      const stops = await run(dir, {
        name: "askhelpcenter",
        action: { workspaceId: "WS-1", projectId: "OTHER-PROJECT" }
      });

      assert.strictEqual(mock.seen.search.projectId, "OTHER-PROJECT",
        'action.projectId overrides the conversation project for the Help Center query');
      assert.strictEqual(mock.seen.messageProject, PROJECT_ID,
        '...but the reply still goes to the conversation project');
      assert.deepStrictEqual(stops, [true]);
    } finally {
      await mock.close();
    }
  });

  // The next three exercise paths where the directive calls back MORE than once
  // (see the quarantined tests below for that defect). They assert the first
  // value and the observable side effects, which are correct as they stand.

  it('sends no reply when the workspace listing comes back empty', async () => {
    const mock = await startMock((server, seen) => {
      server.get('/:projectId/workspaces/', (req, res) => {
        seen.listed = true;
        res.status(200).send({ empty: true });
      });
      server.get('/:projectId/:workspaceId/contents/search', (req, res) => {
        res.status(200).send({ empty: true });
      });
      server.post('/:projectId/requests/:requestId/messages', (req, res) => {
        seen.message = req.body;
        res.status(200).send({ success: true });
      });
    });
    try {
      const dir = directiveFor("anything");
      const stops = await run(dir, { name: "askhelpcenter", action: {} });

      assert.ok(mock.seen.listed);
      assert.strictEqual(mock.seen.message, undefined);
      assert.strictEqual(stops[0], false, 'The flow carries on to the next directive');
    } finally {
      await mock.close();
    }
  });

  it('sends no reply when the workspace listing fails', async () => {
    const mock = await startMock((server, seen) => {
      server.get('/:projectId/workspaces/', (req, res) => res.status(500).send({ success: false }));
      server.get('/:projectId/:workspaceId/contents/search', (req, res) => {
        res.status(200).send({ empty: true });
      });
      server.post('/:projectId/requests/:requestId/messages', (req, res) => {
        seen.message = req.body;
        res.status(200).send({ success: true });
      });
    });
    try {
      const dir = directiveFor("anything");
      const stops = await run(dir, { name: "askhelpcenter", action: {} });

      assert.strictEqual(mock.seen.message, undefined);
      assert.strictEqual(stops[0], false);
    } finally {
      await mock.close();
    }
  });

  it('does not stop the flow when the Help Center reply cannot be delivered', async () => {
    let attempts = 0;
    const mock = await startMock((server) => {
      server.get('/:projectId/:workspaceId/contents/search', (req, res) => {
        res.status(200).send([{ title: "T", url: "https://help.example.com/t" }]);
      });
      server.post('/:projectId/requests/:requestId/messages', (req, res) => {
        attempts += 1;
        res.status(500).send({ success: false });
      });
    });
    try {
      const dir = directiveFor("anything");
      const stops = await run(dir, { name: "askhelpcenter", action: { workspaceId: "WS-1" } });

      assert.strictEqual(attempts, 1, 'The reply is attempted exactly once');
      assert.strictEqual(stops[0], false,
        'An undelivered Help Center reply must not stop the directive chain');
    } finally {
      await mock.close();
    }
  });

  // QUARANTINED -- the three below assert the CORRECT behaviour and are red.
  //
  // directives/agents/DirDeflectToHelpCenter.js has three `callback(...)` calls
  // that are not followed by `return`, so execution continues past them and the
  // callback fires a SECOND time. DirectivesChatbotPlug.process() treats each
  // call as "this directive is done" and walks the rest of the directive list
  // again, so the actions after the block run twice.
  //
  //   :74  no workspaces found  -> callback(false), then falls into the search
  //        with `workspace_id` undefined and calls back again
  //   :79  listing the workspaces failed -> same
  //   :136 the reply could not be delivered -> callback(false), then :139
  //        callback(true)
  //
  // Each test asserts that exactly one value reaches the callback.
  it('calls back exactly once when the workspace listing comes back empty', async () => {
    const mock = await startMock((server) => {
      server.get('/:projectId/workspaces/', (req, res) => res.status(200).send({ empty: true }));
      server.get('/:projectId/:workspaceId/contents/search', (req, res) => res.status(200).send([]));
    });
    try {
      const dir = directiveFor("anything");
      const stops = await run(dir, { name: "askhelpcenter", action: {} });
      assert.deepStrictEqual(stops, [false]);
    } finally {
      await mock.close();
    }
  });

  it('calls back exactly once when the workspace listing fails', async () => {
    const mock = await startMock((server) => {
      server.get('/:projectId/workspaces/', (req, res) => res.status(500).send({ success: false }));
      server.get('/:projectId/:workspaceId/contents/search', (req, res) => res.status(200).send([]));
    });
    try {
      const dir = directiveFor("anything");
      const stops = await run(dir, { name: "askhelpcenter", action: {} });
      assert.deepStrictEqual(stops, [false]);
    } finally {
      await mock.close();
    }
  });

  it('calls back exactly once when the Help Center reply cannot be delivered', async () => {
    const mock = await startMock((server) => {
      server.get('/:projectId/:workspaceId/contents/search', (req, res) => {
        res.status(200).send([{ title: "T", url: "https://help.example.com/t" }]);
      });
      server.post('/:projectId/requests/:requestId/messages', (req, res) => {
        res.status(500).send({ success: false });
      });
    });
    try {
      const dir = directiveFor("anything");
      const stops = await run(dir, { name: "askhelpcenter", action: { workspaceId: "WS-1" } });
      assert.strictEqual(stops.length, 1, 'Got: ' + JSON.stringify(stops));
    } finally {
      await mock.close();
    }
  });

  // QUARANTINED -- DirDeflectToHelpCenter.execute (:22-28) does not guard
  // against a directive with no action: `go(undefined, ...)` dereferences
  // `action.hcReply` and, because `go` is async, the TypeError becomes an
  // unhandled promise rejection - process-fatal under Node's default
  // --unhandled-rejections=throw. Every other directive in the tree guards this.
  it('calls back without crashing on a directive with no action', async () => {
    const dir = directiveFor("anything");
    const stops = await run(dir, { name: "askhelpcenter" });
    assert.strictEqual(stops.length, 1);
  });

});
