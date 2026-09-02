'use strict';

// Black-box journeys for the STATEFUL mock and its control API.
//
//   docker compose -f docker-compose.integration.yml \
//     run --rm tests node integration/tests/control-api.js
//
// `run.js` proves the container boots, finds mongo and redis and answers. This
// file proves the other half: that the mock now keeps real platform state, so a
// test can assert on an OUTCOME ("the request is closed", "the event was
// fired") rather than only on the fact that a call was recorded -- and that
// `POST /__fail` can put any endpoint into a failure the connector has to
// survive.
//
// It is a SEPARATE runner on purpose: run.js is the shipped contract and stays
// untouched.

const assert = require('assert');
const axios = require('axios');
const mongoose = require('mongoose');
const crypto = require('crypto');

const Faq = require('../../tybotRoute/models/faq');
const Faq_kb = require('../../tybotRoute/models/faq_kb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017/tilebot_integration';
const TILEBOT_URL = process.env.TILEBOT_URL || 'http://tilebot:3000';
const MOCK_URL = process.env.MOCK_URL || 'http://mock-tiledesk:3001';

// No dashes: validateRequestId splits the request id on "-" and expects the
// project id to be exactly the third part.
const PROJECT_ID = 'controlProject';

const HTTP = { validateStatus: () => true, timeout: 20000 };

function newRequestId() {
  return 'support-group-' + PROJECT_ID + '-' + crypto.randomUUID().replace(/-/g, '');
}

function envelope(text, requestId) {
  return {
    payload: {
      senderFullname: 'guest#control',
      type: 'text',
      sender: 'A-SENDER',
      recipient: requestId,
      text: text,
      id_project: PROJECT_ID,
      request: { request_id: requestId }
    },
    token: 'XXX'
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, ms, everyMs) {
  const deadline = Date.now() + (ms || 20000);
  for (;;) {
    const v = await predicate();
    if (v) return v;
    if (Date.now() > deadline) return null;
    await sleep(everyMs || 150);
  }
}

async function recordedFor(requestId) {
  const res = await axios.get(`${MOCK_URL}/__recorded`,
    Object.assign({ params: { requestId } }, HTTP));
  assert.strictEqual(res.status, 200, 'the mock must answer /__recorded');
  return res.data;
}

async function mockState() {
  const res = await axios.get(`${MOCK_URL}/__state`, HTTP);
  assert.strictEqual(res.status, 200, 'the mock must answer /__state');
  return res.data.state;
}

/** Wait until the mock's state satisfies `predicate(state)`. */
async function waitForState(predicate, ms) {
  return await waitFor(async () => {
    const s = await mockState();
    return predicate(s) ? s : null;
  }, ms || 20000);
}

let passed = 0;
const failures = [];

async function test(name, fn) {
  process.stdout.write(`  - ${name}\n`);
  try {
    await fn();
    passed++;
    process.stdout.write(`    PASS\n`);
  }
  catch (err) {
    failures.push({ name, err });
    process.stdout.write(`    FAIL: ${err && err.message}\n`);
  }
}

function section(title) {
  process.stdout.write(`\n${title}\n`);
}

let botId;

async function seed() {
  console.log(`[control] connecting to ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI, { autoIndex: false });
  await Faq_kb.createIndexes();
  await Faq.createIndexes();

  const kb = await Faq_kb.create({
    name: 'control api bot',
    id_project: PROJECT_ID,
    secret: 's3cr3t',
    createdBy: 'integration-tests',
    language: 'en',
    type: 'tilebot'
  });
  botId = kb._id.toString();

  await Faq.insertMany([
    {
      // The answer carries \_tdclose, so the connector PUTs
      // /:projectId/requests/:requestId/close on the platform.
      id_faq_kb: botId, id_project: PROJECT_ID,
      intent_display_name: 'close_me',
      intent_id: 'cccccccc-0000-0000-0000-000000000001',
      question: 'close this conversation',
      answer: 'Goodbye.\n\\_tdclose',
      language: 'en', createdBy: 'integration-tests'
    },
    {
      // POST /:projectId/events
      id_faq_kb: botId, id_project: PROJECT_ID,
      intent_display_name: 'fire_it',
      intent_id: 'cccccccc-0000-0000-0000-000000000002',
      question: 'fire the event',
      answer: 'Fired.\n\\_tdfiretiledeskevent --name integration_event',
      language: 'en', createdBy: 'integration-tests'
    }
  ]);

  console.log(`[control] seeded bot ${botId} in project ${PROJECT_ID}`);
}

/** Drive one intent and wait until its reply has reached the mock. */
async function ask(intent, requestId) {
  const res = await axios.post(`${TILEBOT_URL}/ext/${botId}`,
    envelope(intent, requestId), HTTP);
  assert.strictEqual(res.status, 200, 'the webhook is accepted');
  const messages = await waitFor(async () => {
    const rec = await recordedFor(requestId);
    return rec.messages.length >= 1 ? rec.messages : null;
  }, 20000);
  return messages;
}

async function main() {
  await seed();
  await axios.post(`${MOCK_URL}/__reset`, {}, HTTP);

  // ------------------------------------------------------------ journey 1
  section('journey 1 - the mock keeps state, so an OUTCOME can be asserted');

  let closedRequestId;

  await test('a \\_tdclose answer really closes the request on the platform', async () => {
    const requestId = closedRequestId = newRequestId();

    const messages = await ask('/close_me', requestId);
    assert.ok(messages, 'the visitor still sees the reply');
    assert.strictEqual(messages[0].body.text, 'Goodbye.');

    const state = await waitForState((s) => s.requests[requestId] && s.requests[requestId].closed === true);
    assert.ok(state, 'the mock state must show the request closed');
    assert.strictEqual(state.requests[requestId].closed, true);
    assert.strictEqual(state.requests[requestId].status, 1000);
    assert.strictEqual(state.requests[requestId].id_project, PROJECT_ID,
      'and it is closed under the project the conversation belongs to');
  });

  await test('the state also carries the conversation that actually ran', async () => {
    const state = await mockState();
    const request = state.requests[closedRequestId];
    assert.ok(request, 'the request the bot answered is in the state');
    assert.strictEqual(request.messages.length, 1,
      'with the one message the bot posted into it');
    assert.strictEqual(request.messages[0].message.text, 'Goodbye.');
  });

  await test('a \\_tdfiretiledeskevent answer fires a real event', async () => {
    const requestId = newRequestId();
    await ask('/fire_it', requestId);
    const state = await waitForState((s) => s.events.length > 0);
    assert.ok(state, 'the event must reach the platform');
    assert.strictEqual(state.events[0].event.name, 'integration_event');
    assert.strictEqual(state.events[0].projectId, PROJECT_ID);
  });

  // ------------------------------------------------------------ journey 2
  section('journey 2 - POST /__fail arms a real failure on one endpoint');

  await test('with a 500 armed on /close, the request is NOT closed and the container survives', async () => {
    const armed = await axios.post(`${MOCK_URL}/__fail`, {
      method: 'PUT',
      path: '/:projectId/requests/:requestId/close',
      mode: '500',
      times: 1
    }, HTTP);
    assert.strictEqual(armed.status, 200);
    assert.strictEqual(armed.data.armed.mode, '500');

    const requestId = newRequestId();
    const messages = await ask('/close_me', requestId);

    // The visitor still gets the reply: closing is a side effect of the
    // directive, and a platform error must not swallow the answer.
    assert.ok(messages, 'the reply is still delivered');
    assert.strictEqual(messages[0].body.text, 'Goodbye.');

    // The close call was made, and the mock answered it with the injected 500.
    const closeCall = await waitFor(async () => {
      const rec = await recordedFor(requestId);
      return rec.calls.find((c) => c.kind === 'request-close') || null;
    }, 20000);
    assert.ok(closeCall, 'the connector did try to close the request');
    assert.strictEqual(closeCall.failure, '500',
      'and the mock answered that call with the injected 500');

    // THE OUTCOME: the request is still open. An injected failure is served
    // instead of the handler, so no state changed.
    const state = await mockState();
    assert.strictEqual(state.requests[requestId].closed, false,
      'the request must NOT be closed - that is the behaviour change');

    // And the container is still serving after the platform error.
    const health = await axios.get(`${TILEBOT_URL}/`, HTTP);
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data, 'Hello Tilebot!');
  });

  await test('the failure was armed once, so the next close succeeds again', async () => {
    const requestId = newRequestId();
    await ask('/close_me', requestId);
    const state = await waitForState((s) => s.requests[requestId] && s.requests[requestId].closed === true);
    assert.ok(state, 'with the armed failure spent, closing works again');
  });

  // ------------------------------------------------------------ journey 3
  section('journey 3 - __reset clears state, recordings AND armed failures');

  await test('an armed failure does not survive a reset', async () => {
    await axios.post(`${MOCK_URL}/__fail`, {
      path: '/:projectId/requests/:requestId/close',
      mode: '500',
      times: 0            // 0 = until reset
    }, HTTP);

    let dump = await axios.get(`${MOCK_URL}/__state`, HTTP);
    assert.strictEqual(dump.data.failures.length, 1, 'the failure is armed');

    await axios.post(`${MOCK_URL}/__reset`, {}, HTTP);

    dump = await axios.get(`${MOCK_URL}/__state`, HTTP);
    assert.deepStrictEqual(dump.data.failures, [], 'reset disarms it');
    assert.deepStrictEqual(dump.data.state.requests, {}, 'reset clears the state');
    assert.strictEqual(dump.data.recorded, 0, 'reset clears the recordings');

    // And the endpoint behaves normally again, end to end.
    const requestId = newRequestId();
    await ask('/close_me', requestId);
    const state = await waitForState((s) => s.requests[requestId] && s.requests[requestId].closed === true);
    assert.ok(state, 'after the reset the request closes normally again');
  });

  // ------------------------------------------------------------ journey 4
  section('journey 4 - the other failure modes reach the connector too');

  for (const mode of ['401', 'malformed', 'drop']) {
    await test(`a "${mode}" on /close leaves the request open and the container up`, async () => {
      await axios.post(`${MOCK_URL}/__fail`, {
        method: 'PUT',
        path: '/:projectId/requests/:requestId/close',
        mode: mode,
        times: 1
      }, HTTP);

      const requestId = newRequestId();
      const messages = await ask('/close_me', requestId);
      assert.ok(messages, 'the reply is still delivered');

      const closeCall = await waitFor(async () => {
        const rec = await recordedFor(requestId);
        return rec.calls.find((c) => c.kind === 'request-close') || null;
      }, 20000);
      assert.ok(closeCall, 'the close was attempted');
      assert.strictEqual(closeCall.failure, mode);

      const state = await mockState();
      assert.strictEqual(state.requests[requestId].closed, false);

      const health = await axios.get(`${TILEBOT_URL}/`, HTTP);
      assert.strictEqual(health.status, 200, 'the container survives ' + mode);
    });
  }

  // ------------------------------------------------------------ journey 5
  section('journey 5 - POST /__seed preloads platform state');

  await test('a seeded request is served by GET /:projectId/requests/:requestId', async () => {
    await axios.post(`${MOCK_URL}/__reset`, {}, HTTP);
    const requestId = newRequestId();
    await axios.post(`${MOCK_URL}/__seed`, {
      requests: [{
        request_id: requestId,
        id_project: PROJECT_ID,
        lead: { _id: 'lead-seeded-1' },
        department: { _id: 'dep-seeded-1' }
      }],
      leads: [{ _id: 'lead-seeded-1', fullname: 'Ada Lovelace' }]
    }, HTTP);

    const res = await axios.get(`${MOCK_URL}/${PROJECT_ID}/requests/${requestId}`, HTTP);
    assert.strictEqual(res.status, 200, 'a seeded request is found');
    assert.strictEqual(res.data.request_id, requestId);
    assert.strictEqual(res.data.lead._id, 'lead-seeded-1');

    // And the connector runs the conversation on that request rather than
    // synthesising one -- the reply still arrives.
    const messages = await ask('/fire_it', requestId);
    assert.ok(messages, 'the bot answers on a request the platform knows about');
    assert.strictEqual(messages[0].body.text, 'Fired.');
  });

  await test('an unseeded request is still a 404, as the shipped journeys expect', async () => {
    const res = await axios.get(`${MOCK_URL}/${PROJECT_ID}/requests/${newRequestId()}`, HTTP);
    assert.strictEqual(res.status, 404);
  });

  section('----------------------------------------');
  console.log(`${passed} passed, ${failures.length} failed`);
  for (const f of failures) {
    console.log(`\nFAILED: ${f.name}`);
    console.log(f.err && f.err.stack ? f.err.stack : String(f.err));
  }
  return failures.length === 0 ? 0 : 1;
}

main()
  .then(async (code) => {
    await mongoose.disconnect().catch(() => {});
    process.exit(code);
  })
  .catch(async (err) => {
    console.error('\n[control] the run itself blew up:');
    console.error(err && err.stack ? err.stack : err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
