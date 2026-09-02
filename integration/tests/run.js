'use strict';

// Black-box integration tests for docker-compose.integration.yml.
//
// What makes this different from `npm test`
// -----------------------------------------
// The 1398-test suite boots the app IN PROCESS on the host: it requires
// tybotRoute directly, so it shares the process, the node_modules and the
// host's node version with the code under test. This file shares nothing with
// it. The connector runs in a container built from the repository Dockerfile,
// exactly the artefact that is pushed to Docker Hub, and everything here
// happens over the network:
//
//   * MongoDB is seeded through a driver connection of its own;
//   * the bot is driven by HTTP POSTs to the container's port 3000;
//   * every assertion reads what the container POSTed to mock-tiledesk.
//
// So a green run means the image boots, finds mongo and redis by service name,
// resolves its endpoints from the environment and answers -- none of which the
// in-process suite can tell you.
//
// This is NOT the place to re-test directive semantics; the unit suite owns
// that. Every journey below exists to prove one piece of real wiring.

const assert = require('assert');
const axios = require('axios');
const mongoose = require('mongoose');
const crypto = require('crypto');

// The production schemas, out of the image the connector itself runs from.
const Faq = require('../../tybotRoute/models/faq');
const Faq_kb = require('../../tybotRoute/models/faq_kb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017/tilebot_integration';
const TILEBOT_URL = process.env.TILEBOT_URL || 'http://tilebot:3000';
const MOCK_URL = process.env.MOCK_URL || 'http://mock-tiledesk:3001';

// No dashes: validateRequestId splits the request id on "-" and expects the
// project id to be exactly the third part.
const PROJECT_ID = 'integrationProject';

const HTTP = { validateStatus: () => true, timeout: 20000 };

// ------------------------------------------------------------- utilities

function newRequestId() {
  return 'support-group-' + PROJECT_ID + '-' + crypto.randomUUID().replace(/-/g, '');
}

/** The webhook envelope the Tiledesk platform posts on every visitor message. */
function envelope(text, requestId) {
  return {
    payload: {
      senderFullname: 'guest#integration',
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

/** What mock-tiledesk recorded for one request id. */
async function recordedFor(requestId) {
  const res = await axios.get(`${MOCK_URL}/__recorded`,
    Object.assign({ params: { requestId } }, HTTP));
  assert.strictEqual(res.status, 200, 'the mock must answer /__recorded');
  return res.data;
}

/** The messages the bot posted for one request id, once at least `n` exist. */
async function messagesFor(requestId, n, ms) {
  return await waitFor(async () => {
    const rec = await recordedFor(requestId);
    return rec.messages.length >= (n || 1) ? rec.messages : null;
  }, ms || 20000);
}

// --------------------------------------------------------- test harness

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

// ------------------------------------------------------------- the seed

let botId;

async function seed() {
  console.log(`[tests] connecting to ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI, { autoIndex: false });

  // A run must not inherit anything from the last one.
  await mongoose.connection.dropDatabase();

  // The connector connects with autoIndex:false, exactly as startApp.js does,
  // so nothing builds the schema indexes for us. The natural-language journey
  // runs a `$text` query and mongo ERRORS rather than missing without the
  // faq_fulltext index -- so build them, from the production schemas.
  await Faq_kb.createIndexes();
  await Faq.createIndexes();

  const kb = await Faq_kb.create({
    name: 'integration bot',
    id_project: PROJECT_ID,
    secret: 's3cr3t',
    createdBy: 'integration-tests',
    language: 'en',
    type: 'tilebot'
  });
  botId = kb._id.toString();

  await Faq.insertMany([
    {
      id_faq_kb: botId, id_project: PROJECT_ID,
      intent_display_name: 'welcome',
      intent_id: 'dddddddd-0000-0000-0000-000000000001',
      question: 'hi there',
      answer: 'Welcome from a container',
      language: 'en', createdBy: 'integration-tests'
    },
    {
      // Journey 3. The question is NOT the phrase the test sends, so the exact
      // match misses and only the mongo $text matcher can produce this reply.
      id_faq_kb: botId, id_project: PROJECT_ID,
      intent_display_name: 'opening_hours',
      intent_id: 'dddddddd-0000-0000-0000-000000000002',
      question: 'what are your opening hours',
      answer: 'We are open from 9 to 18',
      language: 'en', createdBy: 'integration-tests'
    },
    {
      // Journey 4, turn 1: the answer carries a directive that writes state.
      id_faq_kb: botId, id_project: PROJECT_ID,
      intent_display_name: 'remember_name',
      intent_id: 'dddddddd-0000-0000-0000-000000000003',
      question: 'remember my name',
      answer: 'Noted.\n\\_tdassign --expression "\'Ada Lovelace\'" --assignTo "visitor_name"',
      language: 'en', createdBy: 'integration-tests'
    },
    {
      // Journey 4, turn 2: reads that state back.
      id_faq_kb: botId, id_project: PROJECT_ID,
      intent_display_name: 'greet_by_name',
      intent_id: 'dddddddd-0000-0000-0000-000000000004',
      question: 'greet me by name',
      answer: 'Hello ${visitor_name}, welcome back',
      language: 'en', createdBy: 'integration-tests'
    }
  ]);

  console.log(`[tests] seeded bot ${botId} with 4 intents in project ${PROJECT_ID}`);
}

// ------------------------------------------------------------ the tests

async function main() {
  await seed();
  await axios.post(`${MOCK_URL}/__reset`, {}, HTTP);

  // ------------------------------------------------------------ journey 1
  section('journey 1 - the container boots and serves');

  await test('GET / answers "Hello Tilebot!"', async () => {
    const res = await axios.get(`${TILEBOT_URL}/`, HTTP);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data, 'Hello Tilebot!');
  });

  // ------------------------------------------------------------ journey 2
  section('journey 2 - an explicit intent, answered out of MongoDB');

  await test('the reply text stored in mongo reaches the Tiledesk API', async () => {
    const requestId = newRequestId();

    const res = await axios.post(`${TILEBOT_URL}/ext/${botId}`,
      envelope('/welcome', requestId), HTTP);
    assert.strictEqual(res.status, 200, 'the webhook is accepted');
    assert.deepStrictEqual(res.data, { success: true });

    const messages = await messagesFor(requestId, 1);
    assert.ok(messages, 'the bot must post a reply to mock-tiledesk');
    assert.strictEqual(messages[0].body.text, 'Welcome from a container',
      'the text posted is the `answer` field of the seeded faq document');
    assert.strictEqual(messages[0].projectId, PROJECT_ID,
      'and it is posted under the right project');
    assert.strictEqual(messages[0].body.attributes.intent_info.intent_id,
      'dddddddd-0000-0000-0000-000000000001',
      'carrying the intent_id of the mongo document, so mongo really was the source');
  });

  await test('an explicit intent that is not in mongo posts nothing', async () => {
    const requestId = newRequestId();
    await axios.post(`${TILEBOT_URL}/ext/${botId}`,
      envelope('/no_such_intent_anywhere', requestId), HTTP);
    await sleep(2500);
    const rec = await recordedFor(requestId);
    assert.deepStrictEqual(rec.messages, [],
      'no faq document, no message -- which is what proves the reply above was a real lookup');
  });

  // ------------------------------------------------------------ journey 3
  section('journey 3 - natural-language matching, not a /command');

  await test('"opening hours please" matches the opening_hours intent', async () => {
    const requestId = newRequestId();
    await axios.post(`${TILEBOT_URL}/ext/${botId}`,
      envelope('opening hours please', requestId), HTTP);

    const messages = await messagesFor(requestId, 1);
    assert.ok(messages, 'the mongo full-text matcher must find the intent');
    assert.strictEqual(messages[0].body.text, 'We are open from 9 to 18');
    assert.strictEqual(messages[0].body.attributes.intent_info.intent_name, 'opening_hours',
      'and it must pick THAT intent, not merely the first faq of the bot');
  });

  // ------------------------------------------------------------ journey 4
  section('journey 4 - state carried across two real HTTP requests (redis)');

  await test('an attribute set in turn 1 is rendered in the answer of turn 2', async () => {
    const requestId = newRequestId();

    // turn 1: the stored answer carries \_tdassign
    await axios.post(`${TILEBOT_URL}/ext/${botId}`,
      envelope('/remember_name', requestId), HTTP);
    const first = await messagesFor(requestId, 1);
    assert.ok(first, 'turn 1 must be answered');
    assert.strictEqual(first[0].body.text, 'Noted.',
      'the directive is stripped from the text the visitor sees');

    // turn 2: a separate HTTP request, same conversation
    await axios.post(`${TILEBOT_URL}/ext/${botId}`,
      envelope('/greet_by_name', requestId), HTTP);
    const both = await messagesFor(requestId, 2);
    assert.ok(both, 'turn 2 must be answered too');
    assert.strictEqual(both[1].body.text, 'Hello Ada Lovelace, welcome back',
      'turn 2 filled ${visitor_name} from the state turn 1 left in redis -- '
      + 'nothing but the redis container carries it between the two POSTs');
  });

  await test('the state is scoped to its conversation', async () => {
    const otherRequestId = newRequestId();
    await axios.post(`${TILEBOT_URL}/ext/${botId}`,
      envelope('/greet_by_name', otherRequestId), HTTP);
    const messages = await messagesFor(otherRequestId, 1);
    assert.ok(messages);
    assert.strictEqual(messages[0].body.text, 'Hello ${visitor_name}, welcome back',
      'a different request must not see the other conversation\'s attribute '
      + '(an unresolved placeholder is left verbatim -- that is the shipped behaviour)');
  });

  // ------------------------------------------------------------ journey 5
  section('journey 5 - an unknown bot id is a handled miss, and the container survives it');

  await test('no reply is posted, and the container is still serving afterwards', async () => {
    const requestId = newRequestId();
    const unknownBotId = new mongoose.Types.ObjectId().toString();

    const res = await axios.post(`${TILEBOT_URL}/ext/${unknownBotId}`,
      envelope('/welcome', requestId), HTTP);
    assert.strictEqual(res.status, 200, 'the webhook is still accepted');

    await sleep(2500);
    const rec = await recordedFor(requestId);
    assert.deepStrictEqual(rec.messages, [], 'an unknown bot has nothing to answer with');

    // The assertion that matters: this used to crash the process. If the
    // container had died, compose would have restarted it or these calls
    // would fail outright.
    const health = await axios.get(`${TILEBOT_URL}/`, HTTP);
    assert.strictEqual(health.status, 200, 'the container is still up');
    assert.strictEqual(health.data, 'Hello Tilebot!');

    // Stronger: it still holds its mongo and redis connections and can serve
    // a whole conversation after the miss.
    const afterId = newRequestId();
    await axios.post(`${TILEBOT_URL}/ext/${botId}`, envelope('/welcome', afterId), HTTP);
    const messages = await messagesFor(afterId, 1);
    assert.ok(messages, 'and it still answers a known bot after the miss');
    assert.strictEqual(messages[0].body.text, 'Welcome from a container');
  });

  // ------------------------------------------------------------- summary
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
    console.error('\n[tests] the run itself blew up:');
    console.error(err && err.stack ? err.stack : err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
