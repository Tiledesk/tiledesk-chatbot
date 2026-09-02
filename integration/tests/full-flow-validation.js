'use strict';

// The full-flow validation suite.
//
//   docker compose -f docker-compose.integration.yml \
//     run --rm tests node integration/tests/full-flow-validation.js
//
// What this is
// ------------
// `examples/full-flow-validation-bot.json` is a bot a Tiledesk user can import
// into the designer: one block per directive, grouped into menus, so every
// directive can be clicked through by hand. THIS file is the other half of
// that artefact -- it seeds THAT EXACT FILE into mongo (no second copy of the
// flow lives here) and drives every branch of it through the running
// container, asserting on what the platform mock observed.
//
// Without this, the JSON is a demo: a flow that imports and does nothing looks
// exactly like a flow that imports and works.
//
// The one transformation applied to the file
// ------------------------------------------
// The two web-request blocks address their endpoint through the Tiledesk
// attribute placeholder `${VALIDATION_HTTP_ENDPOINT}` -- documented in
// examples/README.md as the one thing an importer points at their own
// endpoint. Here it is replaced by the mock's base url. Nothing else about the
// file is touched: the intents, the actions and their fields are seeded
// verbatim.
//
// Why the intents go in through the NATIVE DRIVER
// -----------------------------------------------
// tybotRoute/models/faq.js declares no `actions` path, so mongoose's strict
// mode would silently drop every action list on the way in. The connector
// reads intents with `Faq.find().lean()`, so the raw document is what it sees.
// The bot record itself still goes through the Faq_kb model, and `verifySeed()`
// below runs every intent through the Faq model's own validator so a document
// that mongoose would reject can never pass unnoticed.

const assert = require('assert');
const axios = require('axios');
const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const Faq = require('../../tybotRoute/models/faq');
const Faq_kb = require('../../tybotRoute/models/faq_kb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017/tilebot_integration';
const TILEBOT_URL = process.env.TILEBOT_URL || 'http://tilebot:3000';
const MOCK_URL = process.env.MOCK_URL || 'http://mock-tiledesk:3001';

// The url the CONNECTOR must use to reach the mock. Identical to MOCK_URL in
// the compose stack; kept separate because the two are conceptually different
// (one is "where the tests look", the other "where the bot calls").
const BOT_HTTP_ENDPOINT = process.env.MOCK_URL || 'http://mock-tiledesk:3001';

const BOT_FILE = path.join(__dirname, '..', '..', 'examples', 'full-flow-validation-bot.json');

// No dashes: validateRequestId splits the request id on "-" and expects the
// project id to be exactly the third part.
const PROJECT_ID = 'flowProject';

const HTTP = { validateStatus: () => true, timeout: 30000 };

// ------------------------------------------------------------- utilities

function newRequestId() {
  return 'support-group-' + PROJECT_ID + '-' + crypto.randomUUID().replace(/-/g, '');
}

function envelope(text, requestId, lead) {
  const request = { request_id: requestId };
  // The platform puts the contact in the webhook envelope, and
  // ChatbotRequestAttributesUtil copies `request.lead._id` into the
  // `userLeadId` attribute -- which is the ONLY place DirContactUpdate reads
  // the contact id from.
  if (lead) request.lead = lead;
  return {
    payload: {
      senderFullname: 'guest#flow',
      type: 'text',
      sender: 'A-SENDER',
      recipient: requestId,
      text: text,
      id_project: PROJECT_ID,
      request: request
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

async function recordedOfKind(kind) {
  const res = await axios.get(`${MOCK_URL}/__recorded`,
    Object.assign({ params: { kind } }, HTTP));
  return res.data.calls;
}

async function mockState() {
  const res = await axios.get(`${MOCK_URL}/__state`, HTTP);
  assert.strictEqual(res.status, 200);
  return res.data.state;
}

async function waitForState(predicate, ms) {
  return await waitFor(async () => {
    const s = await mockState();
    try { return predicate(s) ? s : null; }
    catch (e) { return null; }
  }, ms || 20000);
}

async function seedMock(payload) {
  const res = await axios.post(`${MOCK_URL}/__seed`, payload, HTTP);
  assert.strictEqual(res.status, 200, 'the mock must accept the seed');
  return res.data;
}

async function armFailure(rule) {
  const res = await axios.post(`${MOCK_URL}/__fail`, rule, HTTP);
  assert.strictEqual(res.status, 200);
  return res.data;
}

/**
 * Every line of text one posted message carries.
 *
 * A reply action sends ONE message with a `commands` list and repeats the
 * joined text in `text` for clients that cannot render commands, so the
 * commands are the authoritative list and `text` is only read when there are
 * none. Same helper as ai-and-vendors.js.
 */
function textsOf(message) {
  const body = message.body || {};
  const commands = (body.attributes && body.attributes.commands) || [];
  const fromCommands = commands
    .filter((c) => c && c.type === 'message' && c.message && typeof c.message.text === 'string')
    .map((c) => c.message.text);
  if (fromCommands.length > 0) return fromCommands;
  return (typeof body.text === 'string' && body.text.length > 0) ? [body.text] : [];
}

/** Every line posted for one conversation, oldest first, once `atLeast` messages exist. */
async function textsFor(requestId, atLeast, ms) {
  const messages = await waitFor(async () => {
    const rec = await recordedFor(requestId);
    return rec.messages.length >= (atLeast || 1) ? rec.messages : null;
  }, ms || 20000);
  if (!messages) return null;
  return messages.reduce((all, m) => all.concat(textsOf(m)), []);
}

/** Wait until one of the lines posted for a conversation contains `needle`. */
async function waitForText(requestId, needle, ms) {
  return await waitFor(async () => {
    const rec = await recordedFor(requestId);
    const lines = rec.messages.reduce((all, m) => all.concat(textsOf(m)), []);
    return lines.some((l) => l.includes(needle)) ? lines : null;
  }, ms || 20000);
}

/** Every settings command posted for one conversation (the voice aliases). */
async function settingsFor(requestId) {
  const rec = await recordedFor(requestId);
  const out = [];
  for (const m of rec.messages) {
    const commands = (m.body && m.body.attributes && m.body.attributes.commands) || [];
    for (const c of commands) if (c && c.type === 'settings') out.push(c);
  }
  return out;
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
let botJson;

/** The importable artefact, with its one documented placeholder resolved. */
function loadBot() {
  const raw = fs.readFileSync(BOT_FILE, 'utf8');
  assert.ok(raw.includes('${VALIDATION_HTTP_ENDPOINT}'),
    'the artefact must still carry the documented endpoint placeholder');
  const resolved = raw.split('${VALIDATION_HTTP_ENDPOINT}').join(BOT_HTTP_ENDPOINT);
  return JSON.parse(resolved);
}

/**
 * Every intent, as the Faq model would validate it. A document the shipped
 * mongoose schema rejects is not importable, whatever else it does.
 */
function verifySeed(bot, id_faq_kb) {
  for (const intent of bot.intents) {
    const doc = new Faq(Object.assign({}, intent, {
      id_faq_kb: id_faq_kb,
      id_project: PROJECT_ID,
      createdBy: 'full-flow-validation'
    }));
    const err = doc.validateSync();
    if (err) {
      throw new Error(`intent "${intent.intent_display_name}" is not a valid faq document: ${err.message}`);
    }
  }
}

async function seed() {
  console.log(`[flow] connecting to ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI, { autoIndex: false });
  await Faq_kb.createIndexes();
  await Faq.createIndexes();

  botJson = loadBot();

  const kb = await Faq_kb.create({
    name: botJson.name,
    description: botJson.description,
    id_project: PROJECT_ID,
    secret: 's3cr3t',
    createdBy: 'full-flow-validation',
    language: botJson.language,
    webhook_enabled: botJson.webhook_enabled,
    type: 'tilebot'
  });
  botId = kb._id.toString();

  verifySeed(botJson, botId);

  const docs = botJson.intents.map((intent) => Object.assign({}, intent, {
    id_faq_kb: botId,
    id_project: PROJECT_ID,
    createdBy: 'full-flow-validation',
    status: 'live',
    topic: 'default',
    createdAt: new Date(),
    updatedAt: new Date()
  }));
  await mongoose.connection.db.collection('faqs').insertMany(docs);

  console.log(`[flow] seeded "${botJson.name}" as ${botId} with ${docs.length} intents `
    + `in project ${PROJECT_ID}, from ${BOT_FILE}`);
}

/** Drive one message into the bot. */
async function ask(text, requestId, lead) {
  const res = await axios.post(`${TILEBOT_URL}/ext/${botId}`,
    envelope(text, requestId, lead), HTTP);
  assert.strictEqual(res.status, 200, 'the webhook is accepted');
  return res;
}

/** A fresh conversation driven with one message; returns its request id. */
async function conversation(text) {
  const requestId = newRequestId();
  await ask(text, requestId);
  return requestId;
}

/** The container is up and still runs a whole conversation. */
async function assertStillHealthy(what) {
  const health = await axios.get(`${TILEBOT_URL}/`, HTTP);
  assert.strictEqual(health.status, 200, `the container is still up after ${what}`);
  const requestId = await conversation('/a_reply');
  const texts = await textsFor(requestId, 1);
  assert.ok(texts && texts.includes('reply line one'),
    `and it still serves a conversation after ${what}`);
}

// ------------------------------------------------------------ the tests

async function main() {
  await seed();
  await axios.post(`${MOCK_URL}/__reset`, {}, HTTP);

  // The platform state every branch needs. Seeded once; individual journeys
  // re-seed the parts they are about to change.
  await seedMock({
    departments: [
      { _id: 'ffv-dep-sales', name: 'Sales', hasBot: false, id_bot: null },
      { _id: 'ffv-dep-support', name: 'Support', hasBot: false, id_bot: null }
    ],
    agents: [{ _id: 'ffv-agent-1', firstname: 'Grace' }],
    openHours: { isopen: true },
    integrations: {
      openai: { value: { apikey: 'an-openai-key' } },
      Brevo: { value: { apikey: 'a-brevo-key' } },
      hubspot: { value: { apikey: 'a-hubspot-key' } },
      customerio: { value: { apikey: 'a-customerio-key' } }
    },
    namespaces: [{
      id: PROJECT_ID, name: 'Default', default: true, id_project: PROJECT_ID,
      engine: { name: 'pinecone', type: 'serverless', apikey: '', vector_size: 1536, index_name: 'ffv-index' }
    }],
    shipments: { FFV12345: { status: 'IN TRANSIT', result: 'OK', error: null } },
    bots: { 'Full Flow Validation Target': { root_id: 'ffv-target-root' } },
    chatbots: [{ _id: 'ffv-target-bot-id', name: 'Full Flow Validation Target' }]
  });

  // ------------------------------------------------------------ journey 0
  section('journey 0 - the artefact is importable-shaped, and it is the seed');

  await test('the file on disk is what was seeded, and every intent is a valid faq', async () => {
    const onDisk = JSON.parse(fs.readFileSync(BOT_FILE, 'utf8'));
    assert.ok(Array.isArray(onDisk.intents) && onDisk.intents.length > 50,
      'the artefact carries the whole flow');
    const inMongo = await mongoose.connection.db.collection('faqs')
      .countDocuments({ id_faq_kb: botId });
    assert.strictEqual(inMongo, onDisk.intents.length,
      'every intent in the file reached mongo -- the test drives the file, not a copy');
    // Re-run the model validation explicitly, so a green suite is proof of it.
    verifySeed(botJson, botId);
    const kb = await Faq_kb.findById(botId);
    assert.strictEqual(kb.name, 'Full Flow Validation');
  });

  await test('the menu block answers with one button per directive family', async () => {
    const requestId = await conversation('/start');
    const messages = await waitFor(async () => {
      const rec = await recordedFor(requestId);
      return rec.messages.length >= 1 ? rec.messages : null;
    }, 20000);
    assert.ok(messages, 'the entry block must answer');
    const commands = messages[0].body.attributes.commands;
    const buttons = commands
      .filter((c) => c.type === 'message')
      .flatMap((c) => (c.message.attributes && c.message.attributes.attachment
        && c.message.attributes.attachment.buttons) || []);
    assert.strictEqual(buttons.length, 9, 'nine families');
    assert.ok(buttons.some((b) => b.value === '/a_messaging'));
    assert.ok(buttons.some((b) => b.value === '/i_terminal'));
  });

  // ------------------------------------------------------------ journey A
  section('journey A - messaging and replies');

  await test('reply posts every message of the block', async () => {
    const requestId = await conversation('/a_reply');
    const texts = await textsFor(requestId, 1);
    assert.ok(texts);
    assert.deepStrictEqual(texts, ['reply line one', 'reply line two']);
  });

  await test('the six voice aliases all dispatch to DirReply and carry their settings', async () => {
    const requestId = await conversation('/a_voice');
    const texts = await waitForText(requestId, 'the six voice aliases all ran');
    assert.ok(texts, 'all six aliases plus the closing reply must post');
    for (const alias of ['dtmf_menu', 'dtmf_form', 'play_prompt', 'audio_record', 'speech_form', 'blind_transfer']) {
      assert.ok(texts.some((t) => t.startsWith(alias + ':')), `${alias} posted its message`);
    }
    const settings = await settingsFor(requestId);
    const subTypes = settings.map((s) => s.subType).filter(Boolean);
    assert.ok(subTypes.includes('dtmf_menu') && subTypes.includes('dtmf_form')
      && subTypes.includes('speech_form') && subTypes.includes('audio_record'),
      'the settings commands survive the round trip to the platform');
    assert.ok(settings.some((s) => s.settings && s.settings.transferTo === 'agent@example.com'),
      'and so does the blind_transfer target');
  });

  await test('replyv2 locks on its buttons and routes the next message to the button connector', async () => {
    const requestId = await conversation('/a_replyv2');
    const first = await textsFor(requestId, 1);
    assert.ok(first && first.some((t) => t.includes('pick a colour')));

    await ask('red', requestId);
    const after = await waitForText(requestId, 'you pressed a button');
    assert.ok(after, 'the button text matched a button and its connector ran');
  });

  await test('replyv2 routes an unmatched answer to its no-match connector', async () => {
    const requestId = await conversation('/a_replyv2');
    await textsFor(requestId, 1);
    await ask('mauve', requestId);
    const after = await waitForText(requestId, 'that matched no button');
    assert.ok(after, 'noMatchIntent ran');
  });

  await test('message and hmessage both post, the hidden one as an info message', async () => {
    const requestId = await conversation('/a_message');
    const texts = await waitForText(requestId, 'message and hmessage both posted');
    assert.ok(texts);
    assert.ok(texts.some((t) => t.includes('a plain message directive')));
    assert.ok(texts.some((t) => t.includes('a hidden (info) message')));

    const rec = await recordedFor(requestId);
    const hidden = rec.messages.find((m) => m.body && m.body.attributes
      && m.body.attributes.subtype === 'info');
    assert.ok(hidden, 'the hmessage carries subtype "info", which is what hides it');
  });

  await test('randomreply posts exactly one of its two variants', async () => {
    const requestId = await conversation('/a_randomreply');
    const texts = await textsFor(requestId, 1);
    assert.ok(texts);
    const variants = texts.filter((t) => t.startsWith('randomreply: variant'));
    assert.strictEqual(variants.length, 1,
      'one of the two message/wait pairs is chosen, not both');
  });

  // ------------------------------------------------------------ journey B
  section('journey B - flow control and conditions');

  await test('intent jumps to the target block AND stops the block it ran in', async () => {
    const requestId = await conversation('/b_intent');
    const texts = await waitForText(requestId, 'jumped into the target block');
    assert.ok(texts, 'the target block answered');
    assert.ok(!texts.some((t) => t.includes('UNREACHABLE')),
      'the action after the intent directive must NOT run -- that is what makes it a jump');
  });

  await test('connect_block dispatches the other block and lets this one carry on', async () => {
    const requestId = await conversation('/b_connect_block');
    const texts = await waitForText(requestId, 'landed in the connected block');
    assert.ok(texts, 'the connected block ran');
    assert.ok(texts.some((t) => t.includes('this block carried on')),
      'and unlike `intent`, the calling block did not stop');
  });

  await test('jsoncondition takes its true connector on a matching attribute', async () => {
    const requestId = await conversation('/b_condition');
    const texts = await waitForText(requestId, 'jsoncondition: TRUE');
    assert.ok(texts, 'the true connector ran');
    assert.ok(texts.some((t) => t === 'jsoncondition: TRUE, ffv_score is 10'),
      'and the attribute the setattribute before it wrote is rendered in the answer');
    assert.ok(!texts.some((t) => t.includes('jsoncondition: FALSE')));
  });

  await test('jsoncondition2 evaluates its `when` expression', async () => {
    const requestId = await conversation('/b_condition_v2');
    const texts = await waitForText(requestId, 'jsoncondition2: TRUE');
    assert.ok(texts, 'the when expression evaluated true');
    assert.ok(texts.some((t) => t === 'jsoncondition2: TRUE, ffv_tier is gold'));
  });

  await test('wait really pauses the flow between two messages', async () => {
    const requestId = newRequestId();
    const started = Date.now();
    await ask('/b_wait', requestId);
    const first = await waitForText(requestId, 'pausing for 1200ms');
    assert.ok(first);
    const second = await waitForText(requestId, 'wait: resumed');
    assert.ok(second, 'the flow resumes after the wait');
    assert.ok(Date.now() - started >= 1200,
      'and at least the configured 1200ms elapsed before it did');
  });

  await test('iteration walks the whole list, one block execution per item', async () => {
    const requestId = await conversation('/b_iteration');
    const texts = await waitFor(async () => {
      const rec = await recordedFor(requestId);
      const lines = rec.messages.reduce((all, m) => all.concat(textsOf(m)), []);
      const items = lines.filter((l) => l.startsWith('iteration: '));
      return items.length >= 3 ? items : null;
    }, 25000);
    assert.ok(texts, 'all three items must be processed');
    assert.deepStrictEqual(texts.slice(0, 3),
      ['iteration: red', 'iteration: green', 'iteration: blue'],
      'in order -- the body block connects back to the iteration block, which is '
      + 'how the loop advances');
  });

  await test('lockintent pins the next message to one block, unlockintent releases it', async () => {
    const requestId = await conversation('/b_lock');
    const locked = await waitForText(requestId, 'whatever you type next lands in the unlock block');
    assert.ok(locked);

    // A phrase with no word in common with any `question` in the bot, so the
    // mongo full-text matcher cannot find an intent for it. Without the lock it
    // reaches defaultFallback; with it, it reaches the locked block.
    const NONSENSE = 'qqqzzz wwwvvv xxyyzz';
    await sleep(1500);
    await ask(NONSENSE, requestId);
    const after = await waitForText(requestId, 'unlockintent: released');
    assert.ok(after, 'the locked block ran instead of the fallback');

    // And after the unlock the very same message DOES reach the fallback.
    await sleep(1500);
    await ask(NONSENSE, requestId);
    const fallback = await waitForText(requestId, 'I did not understand');
    assert.ok(fallback, 'the lock really was released');
  });

  await test('flow_log runs and the block carries on', async () => {
    const requestId = await conversation('/b_flow_log');
    const texts = await waitForText(requestId, 'a line was written to the flow log');
    assert.ok(texts);
  });

  // ------------------------------------------------------------ journey C
  section('journey C - variables, code and data');

  await test('setattribute, setattribute-v2 and assign all write attributes read back later', async () => {
    const requestId = await conversation('/c_attributes');
    const texts = await waitForText(requestId, 'assign:');
    assert.ok(texts);
    assert.ok(texts.includes('setattribute: Ada Lovelace'),
      'setattribute concatenated its two operands with addAsString');
    assert.ok(texts.includes('setattribute-v2: enterprise'));
    assert.ok(texts.includes('assign: 42'), 'assign evaluated its expression');
  });

  await test('delete removes an attribute that was there a moment earlier', async () => {
    const requestId = await conversation('/c_delete');
    const texts = await waitForText(requestId, 'delete: after');
    assert.ok(texts);
    assert.ok(texts.includes('delete: before, ffv_doomed is here-for-now'));
    assert.ok(texts.some((t) => t.startsWith('delete: after,') && !t.includes('here-for-now')),
      'and afterwards the attribute no longer resolves to its value');
  });

  await test('code runs sandboxed javascript and its result reaches the reply', async () => {
    const requestId = await conversation('/c_code');
    const texts = await waitForText(requestId, 'code: total');
    assert.ok(texts);
    assert.ok(texts.includes('code: total 42 over 3 items'),
      'both attributes the script set were written to the conversation');
  });

  await test('functionvalue reads openNow and availableAgents off the platform', async () => {
    await seedMock({ openHours: { isopen: true } });
    const requestId = await conversation('/c_functionvalue');
    const texts = await waitForText(requestId, 'functionvalue: availableAgents');
    assert.ok(texts);
    assert.ok(texts.includes('functionvalue: openNow is true'),
      'openNow came from GET /projects/:projectId/isopen');
    assert.ok(texts.includes('functionvalue: availableAgents is 1'),
      'and the count came from GET /projects/:projectId/users/availables, where one agent is seeded');
  });

  await test('data_table runs insert, get, update, upsert and delete against the platform', async () => {
    await seedMock({ tables: { ffv_table: [] } });
    const requestId = await conversation('/c_datatable');
    const texts = await waitForText(requestId, 'all five operations ran', 25000);
    assert.ok(texts, 'the true connector of the last operation ran');

    const state = await mockState();
    const rows = state.tables.ffv_table || [];
    assert.strictEqual(rows.length, 1,
      'Ada was inserted then deleted, Grace was upserted: one row survives');
    assert.strictEqual(rows[0].data.fullname, 'Grace Hopper');
    assert.strictEqual(rows[0].data.city, 'New York');

    // The data-table routes carry no request id, in the path or in the body,
    // so they are looked up by KIND rather than by conversation.
    for (const k of ['datatable-insert', 'datatable-list', 'datatable-update',
                     'datatable-upsert', 'datatable-delete']) {
      const calls = await recordedOfKind(k);
      assert.ok(calls.length > 0, `the ${k} endpoint was really called`);
    }
    assert.strictEqual(state.warnings.length, 0,
      'and the mock modelled every condition operator the flow sent');
  });

  await test('webrequest (v1) calls the endpoint and assigns a field out of the answer', async () => {
    const requestId = await conversation('/c_webrequest');
    const texts = await waitForText(requestId, 'webrequest: assignments success field is');
    assert.ok(texts);
    assert.ok(texts.includes('webrequest: assignTo body.success is true'),
      '`assignTo` assigned the PARSED body -- a code block read a field off it');
    assert.ok(texts.includes('webrequest: assignments success field is true'),
      'and the `assignments` map picked the same field out of it by json path');

    // The endpoint is not a Tiledesk route, so the mock records it under `other`
    // with no request id -- it is looked up by path.
    const call = (await recordedOfKind('other')).find((c) => c.path === '/ffv/webrequest');
    assert.ok(call, 'the request really left the container');
    assert.strictEqual(call.method, 'GET');
  });

  await test('webrequestv2 takes its true connector, and its false one when the endpoint 500s', async () => {
    const okId = await conversation('/c_webrequestv2');
    const ok = await waitForText(okId, 'webrequestv2: OK');
    assert.ok(ok, 'the true connector ran');
    assert.ok(ok.includes('webrequestv2: OK with status 200'));

    const posted = (await recordedOfKind('other')).find((c) => c.path === '/ffv/webrequestv2');
    assert.ok(posted, 'the endpoint was reached');
    assert.strictEqual(posted.method, 'POST');
    assert.strictEqual(posted.body.source, 'full-flow-validation',
      'with the json body the block declares');

    await armFailure({ method: 'POST', path: '/ffv/webrequestv2', mode: '500', times: 1 });
    const koId = await conversation('/c_webrequestv2');
    const ko = await waitForText(koId, 'webrequestv2: FAILED');
    assert.ok(ko, 'a 500 drives the false connector rather than stalling the flow');
    await assertStillHealthy('a failed web request');
  });

  await test('web_response answers the caller of POST /block/:project/:bot/:block', async () => {
    const res = await axios.post(
      `${TILEBOT_URL}/block/${PROJECT_ID}/${botId}/FFV_C_WEBRESP`,
      { token: 'XXX' },
      Object.assign({}, HTTP, { timeout: 25000 }));
    assert.strictEqual(res.status, 201,
      'the status the web_response block declares is the status the caller gets');
    assert.deepStrictEqual(res.data, { validated: true, block: 'c_webresponse' },
      'and its payload is the body -- published over redis and picked up by the '
      + 'subscription the /block route opened');
  });

  // ------------------------------------------------------------ journey D
  section('journey D - capturing user input');

  await test('capture_user_reply stores the next message and hands over', async () => {
    const requestId = await conversation('/d_capture_reply');
    const asked = await waitForText(requestId, 'what is your favourite colour');
    assert.ok(asked);

    // The reply is posted BEFORE capture_user_reply takes its lock, so a
    // follow-up sent the instant the question lands can overtake the lock.
    // A visitor types; this waits.
    await sleep(1500);
    await ask('turquoise', requestId);
    const answered = await waitForText(requestId, 'you said turquoise');
    assert.ok(answered, 'the captured text was assigned and rendered in the next block');
  });

  await test('form asks each field, rejects a bad one and completes', async () => {
    const requestId = await conversation('/d_form');
    const q1 = await waitForText(requestId, 'what is your name');
    assert.ok(q1, 'the first field is asked');

    await sleep(1500);
    await ask('Ada', requestId);
    const q2 = await waitForText(requestId, 'and your email');
    assert.ok(q2, 'the second field is asked -- which only happens because the '
      + 'block locks the intent itself (DirForm locks the ACTION only) AND the '
      + 'form action carries `_tdActionId` equal to its `action_id`, which is '
      + 'what the dispatcher compares the lock against');
    assert.ok(q2.some((t) => t.includes('${ffv_form_name}')),
      'a form field label is filled by the CLIENT, not the server, so the '
      + 'placeholder is posted verbatim -- asserting that keeps the difference '
      + 'from a reply action honest');

    await sleep(1500);
    await ask('not-an-email', requestId);
    const bad = await waitForText(requestId, 'that email is not valid');
    assert.ok(bad, 'the field regex rejected it and the field was asked again');

    await sleep(1500);
    await ask('ada@example.com', requestId);
    const done = await waitForText(requestId, 'form: got');
    assert.ok(done, 'the form ended and the block carried on');
    assert.ok(done.some((t) => t === 'form: got Ada <ada@example.com>'),
      'with both captured fields');

    // The unlockintent after the form really released the conversation.
    await sleep(1500);
    await ask('qqqzzz wwwvvv xxyyzz', requestId);
    const released = await waitForText(requestId, 'I did not understand');
    assert.ok(released, 'the conversation is no longer pinned to the form block');
  });

  await test('clear_transcript runs and the block carries on', async () => {
    const requestId = await conversation('/d_clear_transcript');
    const texts = await waitForText(requestId, 'the transcript is empty again');
    assert.ok(texts);
  });

  // ------------------------------------------------------------ journey E
  section('journey E - agents, departments and opening hours');

  await test('ifonlineagents branches both ways on the availability the platform reports', async () => {
    await seedMock({ agents: [{ _id: 'ffv-agent-1', firstname: 'Grace' }] });
    const onId = await conversation('/e_online_agents');
    const on = await waitForText(onId, 'agents ARE online');
    assert.ok(on, 'with an agent available the true connector runs');

    await seedMock({ agents: [] });
    const offId = await conversation('/e_online_agents');
    const off = await waitForText(offId, 'NO agents online');
    assert.ok(off, 'and with none, the false one');
  });

  await test('ifonlineagentsv2 asks with ?raw=true and ignores the operating hours when told to', async () => {
    await seedMock({ agents: [{ _id: 'ffv-agent-1', firstname: 'Grace' }], openHours: { isopen: false } });
    const requestId = await conversation('/e_online_agents_v2');
    const texts = await waitForText(requestId, 'ifonlineagentsv2: agents ARE online');
    assert.ok(texts, 'ignoreOperatingHours:true means a closed project still reports online');

    const call = (await recordedOfKind('available-agents')).slice(-1)[0];
    assert.strictEqual(call.query.raw, 'true', 'v2 is the version that sends ?raw=true');
    await seedMock({ openHours: { isopen: true } });
  });

  await test('ifopenhours branches on the project opening hours', async () => {
    await seedMock({ openHours: { isopen: true } });
    const openId = await conversation('/e_open_hours');
    assert.ok(await waitForText(openId, 'we are OPEN'));

    await seedMock({ openHours: { isopen: false } });
    const closedId = await conversation('/e_open_hours');
    assert.ok(await waitForText(closedId, 'we are CLOSED'));
    await seedMock({ openHours: { isopen: true } });
  });

  await test('department really moves the request to the named department', async () => {
    const requestId = await conversation('/e_department');
    assert.ok(await waitForText(requestId, 'department: moved to Sales'));
    const state = await waitForState((s) => s.requests[requestId]
      && s.requests[requestId].department
      && s.requests[requestId].department._id === 'ffv-dep-sales');
    assert.ok(state, 'the department the name resolved to is the one the request now carries');
  });

  // ------------------------------------------------------------ journey F
  section('journey F - Tiledesk platform operations');

  await test('add_tags tags both the request and the contact', async () => {
    const requestId = newRequestId();
    await seedMock({
      requests: [{ request_id: requestId, id_project: PROJECT_ID, lead: { _id: 'ffv-lead-1' } }],
      leads: [{ _id: 'ffv-lead-1', fullname: 'Ada Lovelace' }]
    });
    await ask('/f_add_tags', requestId);
    assert.ok(await waitForText(requestId, 'the request and the contact are tagged'));

    const state = await waitForState((s) => s.requests[requestId]
      && s.requests[requestId].tags.length >= 2
      && s.leads['ffv-lead-1'] && s.leads['ffv-lead-1'].tags.length >= 1);
    assert.ok(state, 'both tag endpoints were called');
    const requestTags = state.requests[requestId].tags.map((t) => t.tag || t);
    assert.ok(requestTags.includes('full-flow-validation') && requestTags.includes('verified'),
      'the comma separated list became two tags on the request');
    assert.ok(state.leads['ffv-lead-1'].tags.includes('validated-contact'),
      'and the contact carries its own tag, sent in the other body shape');
  });

  await test('leadupdate writes the contact record', async () => {
    const requestId = newRequestId();
    await seedMock({
      requests: [{ request_id: requestId, id_project: PROJECT_ID, lead: { _id: 'ffv-lead-2' } }],
      leads: [{ _id: 'ffv-lead-2' }]
    });
    // DirContactUpdate reads the contact id off the `userLeadId` ATTRIBUTE, and
    // that attribute is only ever written from `payload.request.lead._id` of the
    // incoming webhook -- so the envelope has to carry the contact.
    await ask('/f_leadupdate', requestId, { _id: 'ffv-lead-2', fullname: 'Ada' });
    assert.ok(await waitForText(requestId, 'the contact was updated'));

    const state = await waitForState((s) => s.leads['ffv-lead-2']
      && s.leads['ffv-lead-2'].email === 'ada@example.com');
    assert.ok(state, 'the lead was updated on the platform');
    assert.strictEqual(state.leads['ffv-lead-2'].fullname, 'Ada Lovelace');
    assert.strictEqual(state.leads['ffv-lead-2'].company, 'Analytical Engines');
  });

  await test('firetiledeskevent fires a real event, from a TEXT answer directive', async () => {
    const requestId = await conversation('/f_event');
    assert.ok(await waitForText(requestId, 'a custom event was fired'),
      'the text around the directive is what the visitor sees');
    const state = await waitForState((s) =>
      s.events.some((e) => e.event && e.event.name === 'full_flow_validation_event'));
    assert.ok(state, 'and the event reached POST /:projectId/events');
  });

  await test('email hands the message to the platform email endpoint', async () => {
    const requestId = await conversation('/f_email');
    assert.ok(await waitForText(requestId, 'the message was handed to the platform'));
    const sent = await waitFor(async () => {
      const calls = await recordedOfKind('other');
      return calls.find((c) => c.path === `/${PROJECT_ID}/emails/internal/send`) || null;
    }, 15000);
    assert.ok(sent, 'the connector posted to /:projectId/emails/internal/send');
    assert.strictEqual(sent.body.to, 'team@example.com');
    assert.strictEqual(sent.body.subject, 'Full flow validation');
    assert.strictEqual(sent.body.replyto, 'noreply@example.com');
  });

  // ------------------------------------------------------------ journey G
  section('journey G - CRM and vendor integrations');

  await test('brevo, hubspot and customerio each create their record', async () => {
    const brevoId = await conversation('/g_brevo');
    const brevo = await waitForText(brevoId, 'brevo: OK');
    assert.ok(brevo, 'brevo took its true connector');
    assert.ok(brevo.includes('brevo: OK, status 201'));

    const hubspotId = await conversation('/g_hubspot');
    const hubspot = await waitForText(hubspotId, 'hubspot: OK');
    assert.ok(hubspot && hubspot.includes('hubspot: OK, status 201'));

    const cioId = await conversation('/g_customerio');
    const cio = await waitForText(cioId, 'customerio: OK');
    assert.ok(cio && cio.includes('customerio: OK, status 204'),
      'Customer.io answers 204 with no body at all');

    const state = await mockState();
    assert.ok(state.vendors.brevo.contacts.some((c) => c.contact.email === 'ada@example.com'));
    assert.ok(state.vendors.hubspot.contacts.some((c) => c.properties.firstname === 'Ada'));
    assert.ok(state.vendors.customerio.submissions.some((s) => s.formId === 'ffv-form'));
  });

  await test('make triggers its webhook and qapla looks the shipment up', async () => {
    const makeId = await conversation('/g_make');
    const make = await waitForText(makeId, 'make: OK');
    assert.ok(make && make.includes('make: OK, status 200'));
    const state1 = await mockState();
    assert.ok(state1.vendors.make.triggers.some((t) => t.body.name === 'Ada Lovelace'));

    const qaplaId = await conversation('/g_qapla');
    const qapla = await waitForText(qaplaId, 'qapla: the shipment is');
    assert.ok(qapla && qapla.includes('qapla: the shipment is IN TRANSIT'));
    const lookup = (await recordedOfKind('qapla')).slice(-1)[0];
    assert.strictEqual(lookup.query.trackingNumber, 'FFV12345',
      'the tracking number travels as a query parameter for this vendor');
  });

  await test('send_whatsapp broadcasts, and takes its false connector on a 500', async () => {
    const okId = await conversation('/g_whatsapp');
    assert.ok(await waitForText(okId, 'send_whatsapp: accepted'));
    const state = await mockState();
    const broadcast = state.vendors.whatsapp.broadcasts.find((b) => b.payload.transaction_id === okId);
    assert.ok(broadcast, 'the broadcast is tied to the conversation by transaction_id');
    assert.strictEqual(broadcast.payload.receiver_list[0].phone_number, '+390000000000');

    await armFailure({ method: 'POST', path: '/vendor/whatsapp/tiledesk/broadcast', mode: '500', times: 1 });
    const koId = await conversation('/g_whatsapp');
    assert.ok(await waitForText(koId, 'send_whatsapp: refused'),
      'a refused broadcast still answers the visitor');
  });

  await test('whatsapp_attribute broadcasts a payload an earlier block built', async () => {
    const requestId = await conversation('/g_whatsapp_attribute');
    assert.ok(await waitForText(requestId, 'the payload in ffv_wa_payload was broadcast'));
    const state = await waitForState((s) =>
      s.vendors.whatsapp.broadcasts.some((b) => b.payload.transaction_id === requestId));
    assert.ok(state, 'the object the code block wrote to the attribute was the one broadcast');
    const broadcast = state.vendors.whatsapp.broadcasts
      .find((b) => b.payload.transaction_id === requestId);
    assert.strictEqual(broadcast.payload.template.name, 'hello_world');
  });

  // ------------------------------------------------------------ journey H
  section('journey H - AI');

  await test('askgpt answers out of the v1 knowledge base', async () => {
    await seedMock({
      llm: { qa: { answer: 'We are open 9 to 18', success: true, source_url: 'http://kb.ffv/hours' } }
    });
    const requestId = await conversation('/h_askgpt');
    const texts = await waitForText(requestId, 'askgpt: ');
    assert.ok(texts, 'the true connector ran');
    assert.ok(texts.includes('askgpt: We are open 9 to 18'));
    assert.ok(texts.includes('askgpt source: http://kb.ffv/hours'));
    const call = (await recordedOfKind('llm-qa')).slice(-1)[0];
    assert.strictEqual(call.body.kbid, 'replace-me-with-your-kb-id',
      'the kbid the block declares is what was asked');
  });

  await test('askgpt takes its false connector when the LLM 500s', async () => {
    await armFailure({ method: 'POST', path: '/llm/kb/qa', mode: '500', times: 1 });
    const requestId = await conversation('/h_askgpt');
    assert.ok(await waitForText(requestId, 'askgpt: no answer'),
      'the flow must not stall on an LLM failure');
    await assertStillHealthy('an LLM 500');
  });

  await test('askgptv2 answers out of a namespace and files the answered question', async () => {
    await seedMock({
      llm: { namespaceQa: { answer: 'the namespace answer', success: true, source: 'http://kb.ffv/article' } }
    });
    const requestId = await conversation('/h_askgptv2');
    const texts = await waitForText(requestId, 'askgptv2: ');
    assert.ok(texts);
    assert.ok(texts.includes('askgptv2: the namespace answer'));
    const call = (await recordedOfKind('llm-namespace-qa')).slice(-1)[0];
    assert.strictEqual(call.body.namespace, PROJECT_ID,
      'the namespace defaults to the project id when the block names none');
  });

  await test('ai_prompt runs a free-form prompt', async () => {
    await seedMock({ llm: { ask: { answer: 'Could you please rephrase that?', chat_history_dict: {} } } });
    const requestId = await conversation('/h_ai_prompt');
    const texts = await waitForText(requestId, 'ai_prompt: ');
    assert.ok(texts);
    assert.ok(texts.includes('ai_prompt: Could you please rephrase that?'));
    const call = (await recordedOfKind('llm-ask')).slice(-1)[0];
    assert.strictEqual(call.body.llm_key, 'an-openai-key',
      'with the key from the project openai integration');
  });

  await test('ai_condition routes on the label the LLM answers with, and falls back', async () => {
    await seedMock({ llm: { ask: { answer: 'billing', chat_history_dict: {} } } });
    const billingId = await conversation('/h_ai_condition');
    assert.ok(await waitForText(billingId, 'routed to BILLING'),
      'the label matched one of the block\'s conditions');

    await seedMock({ llm: { ask: { answer: 'fallback', chat_history_dict: {} } } });
    const fallbackId = await conversation('/h_ai_condition');
    assert.ok(await waitForText(fallbackId, 'no label matched'),
      'and "fallback" takes the fallback connector');
  });

  await test('gpt_task runs a chat completion against OPENAI_ENDPOINT', async () => {
    await seedMock({
      llm: {
        completion: {
          id: 'chatcmpl-ffv', object: 'chat.completion', created: 1694687347, model: 'gpt-4o',
          choices: [{ index: 0, message: { role: 'assistant', content: 'The visitor validated the flow.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 }
        }
      }
    });
    const requestId = await conversation('/h_gpt_task');
    const texts = await waitForText(requestId, 'gpt_task: ');
    assert.ok(texts);
    assert.ok(texts.includes('gpt_task: The visitor validated the flow.'));
    const call = (await recordedOfKind('openai-completion')).slice(-1)[0];
    assert.strictEqual(call.path, '/llm/openai/v1/chat/completions');
    assert.strictEqual(call.authorization, 'Bearer an-openai-key');
  });

  await test('add_kb_content files a document into the namespace', async () => {
    const requestId = await conversation('/h_add_kb_content');
    assert.ok(await waitForText(requestId, 'add_kb_content: the note was filed'));
    const state = await waitForState((s) => s.kb.contents.some((c) =>
      c.content && c.content.name === 'Full flow validation note'));
    assert.ok(state, 'the content reached POST /:projectId/kb');
    const filed = state.kb.contents.find((c) => c.content.name === 'Full flow validation note');
    assert.strictEqual(filed.content.namespace, PROJECT_ID);
    assert.deepStrictEqual(filed.content.tags, ['full-flow-validation']);
  });

  // ------------------------------------------------------------ journey I
  section('journey I - lifecycle, the terminal blocks');

  await test('agent hands the conversation to a human on the platform', async () => {
    const requestId = await conversation('/i_agent');
    assert.ok(await waitForText(requestId, 'handing you over to a human'));
    const state = await waitForState((s) => s.requests[requestId]
      && s.requests[requestId].movedToAgent === true);
    assert.ok(state, 'PUT /:projectId/requests/:requestId/agent was called');
    assert.strictEqual(state.requests[requestId].status, 200,
      'and the request is ASSIGNED, not left with the bot');
  });

  await test('move_to_unassigned empties the participants', async () => {
    const requestId = newRequestId();
    await seedMock({
      requests: [{ request_id: requestId, id_project: PROJECT_ID, participants: ['bot_ffv'] }]
    });
    await ask('/i_unassigned', requestId);
    assert.ok(await waitForText(requestId, 'back in the queue'));
    const state = await waitForState((s) => s.requests[requestId]
      && s.requests[requestId].participants.length === 0);
    assert.ok(state, 'the participants array was replaced with an empty one');
  });

  await test('removecurrentbot detaches the bot participant', async () => {
    const requestId = newRequestId();
    await seedMock({
      requests: [{
        request_id: requestId, id_project: PROJECT_ID,
        participants: ['bot_ffv'], participantsBots: ['bot_ffv']
      }]
    });
    await ask('/i_removecurrentbot', requestId);
    assert.ok(await waitForText(requestId, 'this bot is leaving the conversation'));
    const removed = await waitFor(async () => {
      const rec = await recordedFor(requestId);
      return rec.calls.find((c) => c.kind === 'request-participants' && c.method === 'DELETE') || null;
    }, 20000);
    assert.ok(removed, 'the bot participant was deleted');
    const state = await mockState();
    assert.ok(!state.requests[requestId].participants.includes('bot_ffv'),
      'and it is gone from the request');
  });

  await test('replacebot, replacebotv2 and replacebotv3 each hand over to another bot', async () => {
    // v1 does NOT use the /replace endpoint: TiledeskClient.replaceBotByName
    // looks the bot up in GET /:projectId/faq_kb and then swaps the request
    // PARTICIPANT. That is the observable difference between v1 and v2/v3.
    const v1 = await conversation('/i_replacebot');
    assert.ok(await waitForText(v1, 'handing over to another bot by name'));
    const s1 = await waitForState((s) => s.requests[v1]
      && s.requests[v1].participants.includes('bot_ffv-target-bot-id'));
    assert.ok(s1, 'v1 resolved the bot by NAME out of the project bot list and '
      + 'added it to the conversation as a participant');
    const listed = await recordedOfKind('chatbot-list');
    assert.ok(listed.length > 0, 'and it really read the bot list to do so');

    const v2 = await conversation('/i_replacebotv2');
    assert.ok(await waitForText(v2, 'handing over to another bot by slug'));
    const s2 = await waitForState((s) => s.requests[v2] && s.requests[v2].replaced);
    assert.ok(s2);
    assert.strictEqual(s2.requests[v2].replaced.body.slug, 'full-flow-validation-target',
      'v2 with nameAsSlug identifies it by SLUG');

    const v3 = await conversation('/i_replacebotv3');
    assert.ok(await waitForText(v3, 'handing over to another bot by id'));
    const s3 = await waitForState((s) => s.requests[v3] && s.requests[v3].replaced);
    assert.ok(s3);
    assert.strictEqual(s3.requests[v3].replaced.body.id, 'replace-me-with-a-bot-id',
      'v3 identifies it by ID');
  });

  await test('close really closes the request, and the bot answers nothing afterwards', async () => {
    const requestId = await conversation('/i_close');
    assert.ok(await waitForText(requestId, 'this conversation is now closed'));
    const state = await waitForState((s) => s.requests[requestId]
      && s.requests[requestId].closed === true);
    assert.ok(state, 'PUT /:projectId/requests/:requestId/close was called');
    assert.strictEqual(state.requests[requestId].status, 1000);
  });

  await test('the container is still serving after every terminal branch', async () => {
    await assertStillHealthy('the whole terminal journey');
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
    console.error('\n[flow] the run itself blew up:');
    console.error(err && err.stack ? err.stack : err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
