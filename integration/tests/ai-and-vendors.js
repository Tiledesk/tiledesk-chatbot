'use strict';

// Black-box journeys for the AI and vendor half of the mock.
//
//   docker compose -f docker-compose.integration.yml \
//     run --rm tests node integration/tests/ai-and-vendors.js
//
// run.js proves the image boots and answers out of mongo and redis;
// control-api.js proves the mock keeps platform STATE and can be armed to
// fail. This file covers the endpoints the connector talks to that are NOT the
// Tiledesk platform: the LLM server (KB_ENDPOINT, KB_ENDPOINT_QA,
// OPENAI_ENDPOINT) and the vendors (Qapla, Whatsapp, ...), all served by the
// same mock under their own path prefixes -- see the "AI / LLM" section of
// integration/mock-tiledesk/server.js and the connector's environment in
// docker-compose.integration.yml.
//
// What is worth proving here, and what is not
// -------------------------------------------
// NOT: directive semantics. The unit suite owns those, and every response
// shape this mock serves is copied from the stub that suite already runs these
// same directives against.
//
// YES: that a real container, configured only through its environment,
//   * reaches the right url with the right body,
//   * carries the answer back into the reply the visitor sees,
//   * takes its ERROR path when the endpoint is armed to fail, and keeps
//     serving afterwards -- every defect this project has fixed lived on an
//     error path, and an error path that is never executed in an image is an
//     error path nobody has ever seen work.

const assert = require('assert');
const axios = require('axios');
const mongoose = require('mongoose');
const crypto = require('crypto');

const Faq_kb = require('../../tybotRoute/models/faq_kb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017/tilebot_integration';
const TILEBOT_URL = process.env.TILEBOT_URL || 'http://tilebot:3000';
const MOCK_URL = process.env.MOCK_URL || 'http://mock-tiledesk:3001';

// No dashes: validateRequestId splits the request id on "-" and expects the
// project id to be exactly the third part.
const PROJECT_ID = 'aiProject';

const HTTP = { validateStatus: () => true, timeout: 20000 };

function newRequestId() {
  return 'support-group-' + PROJECT_ID + '-' + crypto.randomUUID().replace(/-/g, '');
}

function envelope(text, requestId) {
  return {
    payload: {
      senderFullname: 'guest#ai',
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

async function recordedOfKind(kind) {
  const res = await axios.get(`${MOCK_URL}/__recorded`,
    Object.assign({ params: { kind } }, HTTP));
  assert.strictEqual(res.status, 200, 'the mock must answer /__recorded');
  return res.data.calls;
}

async function mockState() {
  const res = await axios.get(`${MOCK_URL}/__state`, HTTP);
  assert.strictEqual(res.status, 200, 'the mock must answer /__state');
  return res.data.state;
}

async function seedMock(payload) {
  const res = await axios.post(`${MOCK_URL}/__seed`, payload, HTTP);
  assert.strictEqual(res.status, 200, 'the mock must accept the seed');
  return res.data;
}

async function armFailure(rule) {
  const res = await axios.post(`${MOCK_URL}/__fail`, rule, HTTP);
  assert.strictEqual(res.status, 200, 'the mock must accept the failure rule');
  return res.data;
}

/**
 * Every line of text the connector posted for one message.
 *
 * A reply action sends ONE message carrying a `commands` list, and repeats the
 * joined text in the message's own `text` field for clients that cannot render
 * commands. The commands are the authoritative list -- reading `text` as well
 * would count every line twice -- so `text` is only used when there are none.
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

/** Every line of text posted for one conversation, oldest first. */
async function textsFor(requestId, atLeast, ms) {
  const messages = await waitFor(async () => {
    const rec = await recordedFor(requestId);
    return rec.messages.length >= (atLeast || 1) ? rec.messages : null;
  }, ms || 20000);
  if (!messages) return null;
  return messages.reduce((all, m) => all.concat(textsOf(m)), []);
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

/** A reply action that posts one message per line of `texts`. */
function replyAction(texts) {
  return {
    _tdActionType: 'reply',
    text: 'xxx',
    attributes: {
      commands: texts.map((text) => ({
        type: 'message',
        message: { type: 'text', text: text }
      }))
    }
  };
}

/**
 * The intents are written with an `actions` list, which is the shape the flow
 * designer produces for every AI and integration block -- a text `answer` with
 * a `\_td...` directive cannot express one, because the text syntax carries no
 * action object (it parses to `{ name, parameter }` only, see
 * @tiledesk/tiledesk-chatbot-util parseDirectives) while DirAskGPT and friends
 * all require `directive.action`.
 *
 * They are therefore inserted through the NATIVE DRIVER, not through the Faq
 * model: tybotRoute/models/faq.js declares no `actions` path, so mongoose's
 * strict mode would silently drop the whole list on the way in. The connector
 * reads intents with `Faq.find().lean()` (engine/MongodbBotsDataSource.js), so
 * what it sees is the raw document -- exactly what is written here.
 */
async function seed() {
  console.log(`[ai] connecting to ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI, { autoIndex: false });

  const kb = await Faq_kb.create({
    name: 'ai and vendors bot',
    id_project: PROJECT_ID,
    secret: 's3cr3t',
    createdBy: 'integration-tests',
    language: 'en',
    type: 'tilebot'
  });
  botId = kb._id.toString();

  const base = {
    id_faq_kb: botId, id_project: PROJECT_ID,
    question: '', answer: '',
    language: 'en', createdBy: 'integration-tests',
    status: 'live', topic: 'default',
    webhook_enabled: false, enabled: true
  };

  await mongoose.connection.db.collection('faqs').insertMany([

    // --------------------------------------------------- askgpt (v1 /qa)
    Object.assign({}, base, {
      intent_display_name: 'ask_kb',
      intent_id: 'ASK_KB',
      actions: [{
        _tdActionType: 'askgpt',
        _tdActionTitle: 'ask the kb',
        question: 'what are the opening hours?',
        kbid: 'kb-integration-1',
        assignReplyTo: 'kb_reply',
        assignSourceTo: 'kb_source',
        trueIntent: '#KB_OK',
        falseIntent: '#KB_KO'
      }]
    }),
    Object.assign({}, base, {
      intent_display_name: 'kb_ok', intent_id: 'KB_OK',
      actions: [replyAction(['kb says: {{kb_reply}}', 'kb source: {{kb_source}}'])]
    }),
    Object.assign({}, base, {
      intent_display_name: 'kb_ko', intent_id: 'KB_KO',
      actions: [replyAction(['kb failed: {{kb_reply}}'])]
    }),

    // ------------------------------------------ gpt_task (chat/completions)
    Object.assign({}, base, {
      intent_display_name: 'gpt_task', intent_id: 'GPT_TASK',
      actions: [{
        _tdActionType: 'gpt_task',
        _tdActionTitle: 'summarise',
        question: 'summarise the conversation',
        model: 'gpt-4',
        // 'text' keeps DirGptTask from running its json coercion on the
        // completion, so what the endpoint answered is what reaches the reply.
        formatType: 'text',
        assignReplyTo: 'gpt_reply',
        trueIntent: '#GPT_OK',
        falseIntent: '#GPT_KO'
      }]
    }),
    Object.assign({}, base, {
      intent_display_name: 'gpt_ok', intent_id: 'GPT_OK',
      actions: [replyAction(['gpt says: {{gpt_reply}}'])]
    }),
    Object.assign({}, base, {
      intent_display_name: 'gpt_ko', intent_id: 'GPT_KO',
      actions: [replyAction(['gpt failed: {{gpt_reply}}'])]
    }),

    // ------------------------------------------------------------- qapla
    // No trueIntent/falseIntent on purpose: DirQapla then calls back without
    // stopping and the reply action below runs on BOTH paths, so the same
    // intent shows the success and the failure.
    Object.assign({}, base, {
      intent_display_name: 'track', intent_id: 'TRACK',
      actions: [
        {
          _tdActionType: 'qapla',
          _tdActionTitle: 'track the parcel',
          trackingNumber: 'AB123',
          apiKey: 'an-inline-qapla-key',
          assignStatusTo: 'qapla_status',
          assignResultTo: 'qapla_result',
          assignErrorTo: 'qapla_error'
        },
        replyAction([
          'qapla status is: {{qapla_status}}',
          'qapla error is: {{qapla_error}}'
        ])
      ]
    }),

    // ---------------------------------------------------------- whatsapp
    Object.assign({}, base, {
      intent_display_name: 'notify', intent_id: 'NOTIFY',
      actions: [{
        _tdActionType: 'send_whatsapp',
        _tdActionTitle: 'notify on whatsapp',
        payload: {
          receiver_list: [
            { phone_number: '+393485566777', body_params: [{ text: 'Ada' }] }
          ]
        },
        trueIntent: '#WA_OK',
        falseIntent: '#WA_KO'
      }]
    }),
    Object.assign({}, base, {
      intent_display_name: 'wa_ok', intent_id: 'WA_OK',
      actions: [replyAction(['whatsapp accepted'])]
    }),
    Object.assign({}, base, {
      intent_display_name: 'wa_ko', intent_id: 'WA_KO',
      actions: [replyAction(['whatsapp refused'])]
    }),

    // ------------------------------------------------ the remaining routes
    // One intent each, so every endpoint the mock serves is reached by the
    // real image at least once. These prove the wiring -- the path the base
    // url resolves to, and the STATUS CODE the service accepts, which differs
    // per vendor and is the easiest thing to get wrong.
    // None of them declares a connector: the directive then calls back without
    // stopping and the reply action right after it runs, so the status it
    // assigned is what the visitor is told.
    Object.assign({}, base, {
      intent_display_name: 'brevo', intent_id: 'BREVO',
      actions: [
        {
          _tdActionType: 'brevo',
          bodyParameters: { email: 'ada@example.com', FIRSTNAME: 'Ada' },
          assignStatusTo: 'brevo_status',
          assignErrorTo: 'brevo_error'
        },
        replyAction(['brevo status is: {{brevo_status}}', 'brevo error is: {{brevo_error}}'])
      ]
    }),
    Object.assign({}, base, {
      intent_display_name: 'hubspot', intent_id: 'HUBSPOT',
      actions: [
        {
          _tdActionType: 'hubspot',
          bodyParameters: { email: 'ada@example.com', firstname: 'Ada' },
          assignStatusTo: 'hubspot_status',
          assignErrorTo: 'hubspot_error'
        },
        replyAction(['hubspot status is: {{hubspot_status}}', 'hubspot error is: {{hubspot_error}}'])
      ]
    }),
    Object.assign({}, base, {
      intent_display_name: 'customerio', intent_id: 'CUSTOMERIO',
      actions: [
        {
          _tdActionType: 'customerio',
          formid: 'form-integration-1',
          bodyParameters: { email: 'ada@example.com' },
          assignStatusTo: 'customerio_status',
          assignErrorTo: 'customerio_error'
        },
        replyAction(['customerio status is: {{customerio_status}}',
          'customerio error is: {{customerio_error}}'])
      ]
    }),
    Object.assign({}, base, {
      intent_display_name: 'make', intent_id: 'MAKE',
      actions: [
        {
          _tdActionType: 'make',
          // Ignored: MAKE_ENDPOINT is set, so MakeService posts to the mock
          // instead. That override is the whole reason the variable exists.
          url: 'https://hook.eu1.make.com/never-reached',
          bodyParameters: { name: 'Ada' },
          assignStatusTo: 'make_status',
          assignErrorTo: 'make_error'
        },
        replyAction(['make status is: {{make_status}}', 'make error is: {{make_error}}'])
      ]
    }),
    Object.assign({}, base, {
      intent_display_name: 'ask_namespace', intent_id: 'ASK_NS',
      actions: [{
        _tdActionType: 'askgptv2',
        question: 'what is in the knowledge base?',
        model: 'gpt-4',
        assignReplyTo: 'ns_reply',
        assignSourceTo: 'ns_source',
        trueIntent: '#NS_OK',
        falseIntent: '#NS_KO'
      }]
    }),
    Object.assign({}, base, {
      intent_display_name: 'ns_ok', intent_id: 'NS_OK',
      actions: [replyAction(['ns says: {{ns_reply}}', 'ns source: {{ns_source}}'])]
    }),
    Object.assign({}, base, {
      intent_display_name: 'ns_ko', intent_id: 'NS_KO',
      actions: [replyAction(['ns failed'])]
    }),
    Object.assign({}, base, {
      intent_display_name: 'prompt', intent_id: 'PROMPT',
      actions: [{
        _tdActionType: 'ai_prompt',
        question: 'rewrite this politely',
        llm: 'openai',
        model: 'gpt-4',
        assignReplyTo: 'prompt_reply',
        trueIntent: '#PROMPT_OK',
        falseIntent: '#PROMPT_KO'
      }]
    }),
    Object.assign({}, base, {
      intent_display_name: 'prompt_ok', intent_id: 'PROMPT_OK',
      actions: [replyAction(['prompt says: {{prompt_reply}}'])]
    }),
    Object.assign({}, base, {
      intent_display_name: 'prompt_ko', intent_id: 'PROMPT_KO',
      actions: [replyAction(['prompt failed'])]
    })
  ]);

  console.log(`[ai] seeded bot ${botId} with 20 action intents in project ${PROJECT_ID}`);
}

/** Drive one intent. Returns the webhook response. */
async function ask(intent, requestId) {
  const res = await axios.post(`${TILEBOT_URL}/ext/${botId}`,
    envelope(intent, requestId), HTTP);
  assert.strictEqual(res.status, 200, 'the webhook is accepted');
  return res;
}

/** The container is up and can still run a whole conversation. */
async function assertStillHealthy(what) {
  const health = await axios.get(`${TILEBOT_URL}/`, HTTP);
  assert.strictEqual(health.status, 200, `the container is still up after ${what}`);
  assert.strictEqual(health.data, 'Hello Tilebot!');

  const requestId = newRequestId();
  await ask('/wa_ok', requestId);
  const texts = await textsFor(requestId, 1);
  assert.ok(texts, `and it still serves a conversation after ${what}`);
  assert.deepStrictEqual(texts, ['whatsapp accepted']);
}

// ------------------------------------------------------------ the tests

async function main() {
  await seed();
  await axios.post(`${MOCK_URL}/__reset`, {}, HTTP);

  // The project's own LLM key, so LLMKeyService.resolveOpenAIKey reports
  // publicKey:false and the token quota is NOT consulted. Journey 4 removes it
  // again, which is the only way to reach the quota branch at all.
  //
  // The project integration is now the ONLY project-level source: the
  // /:projectId/kbsettings step was removed from key retrieval upstream.
  await seedMock({ integrations: { openai: { value: { apikey: 'sk-integration' } } } });

  // ------------------------------------------------------------ journey 1
  section('journey 1 - an AI-backed intent answers, and the answer reaches the request');

  await test('the LLM answer is what the visitor is told', async () => {
    await seedMock({
      llm: {
        qa: {
          answer: 'We are open from 9 to 18',
          success: true,
          source_url: 'http://kb.integration/opening-hours'
        }
      }
    });

    const requestId = newRequestId();
    await ask('/ask_kb', requestId);

    const texts = await textsFor(requestId, 1);
    assert.ok(texts, 'the bot must answer');
    assert.deepStrictEqual(texts, [
      'kb says: We are open from 9 to 18',
      'kb source: http://kb.integration/opening-hours'
    ], 'both fields the directive reads off the body reached the reply, and the '
     + 'true connector was taken');

    // And the request really left the container, with the question and the key.
    const rec = await recordedFor(requestId);
    const asked = rec.calls.filter((c) => c.kind === 'llm-qa');
    assert.strictEqual(asked.length, 1, 'exactly one call to {KB_ENDPOINT}/qa');
    assert.strictEqual(asked[0].path, '/llm/kb/qa',
      'the connector resolved KB_ENDPOINT out of its environment');
    assert.strictEqual(asked[0].body.question, 'what are the opening hours?');
    assert.strictEqual(asked[0].body.kbid, 'kb-integration-1');
    assert.strictEqual(asked[0].body.gptkey, 'sk-integration',
      'and it fetched the project key from the openai integration first');

    // The kb-settings step is gone from key retrieval. Nothing may call it.
    assert.strictEqual(rec.calls.filter((c) => c.kind === 'kbsettings').length, 0,
      '/:projectId/kbsettings is no longer part of resolving an LLM key');
  });

  await test('a completion answers a gpt_task block, out of OPENAI_ENDPOINT', async () => {
    await seedMock({
      integrations: { openai: { value: { apikey: 'an-openai-key' } } },
      llm: {
        completion: {
          id: 'chatcmpl-integration',
          object: 'chat.completion',
          created: 1694687347,
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'the visitor asked about opening hours' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 30, completion_tokens: 48, total_tokens: 78 }
        }
      }
    });

    const requestId = newRequestId();
    await ask('/gpt_task', requestId);

    const texts = await textsFor(requestId, 1);
    assert.ok(texts, 'the bot must answer');
    assert.deepStrictEqual(texts, ['gpt says: the visitor asked about opening hours'],
      'resbody.choices[0].message.content is what DirGptTask assigns, and it '
      + 'reached the reply');

    const completions = await recordedOfKind('openai-completion');
    assert.strictEqual(completions.length, 1);
    assert.strictEqual(completions[0].path, '/llm/openai/v1/chat/completions');
    assert.strictEqual(completions[0].authorization, 'Bearer an-openai-key',
      'with the key from the project "openai" integration, not the public one');
    assert.strictEqual(completions[0].body.model, 'gpt-4');
  });

  // ------------------------------------------------------------ journey 2
  section('journey 2 - the AI endpoint is armed to 500: the flow takes its error path');

  await test('a 500 from the LLM drives the false connector, not a stall', async () => {
    await armFailure({ method: 'POST', path: '/llm/kb/qa', mode: '500', times: 1 });

    const requestId = newRequestId();
    await ask('/ask_kb', requestId);

    const texts = await textsFor(requestId, 1);
    assert.ok(texts, 'the conversation must still be answered -- a directive that '
      + 'never calls back leaves it hanging, which is the failure this guards');
    assert.deepStrictEqual(texts, ['kb failed: No answers'],
      'the false connector ran, and assignReplyTo carries DirAskGPT\'s own '
      + '"No answers" default rather than a body it could not read');

    // The failure really was injected, and on that call.
    const rec = await recordedFor(requestId);
    const asked = rec.calls.filter((c) => c.kind === 'llm-qa');
    assert.strictEqual(asked.length, 1, 'the LLM was called once');
    assert.strictEqual(asked[0].failure, '500', 'and answered with the injected 500');

    await assertStillHealthy('an LLM 500');
  });

  await test('the arming was for one call, so the next question is answered again', async () => {
    const requestId = newRequestId();
    await ask('/ask_kb', requestId);
    const texts = await textsFor(requestId, 1);
    assert.ok(texts);
    assert.strictEqual(texts[0], 'kb says: We are open from 9 to 18',
      'the mock is back to answering, so the failure above was the injected one '
      + 'and not the container having broken');
  });

  // ------------------------------------------------------------ journey 3
  section('journey 3 - a vendor call succeeds, and the same vendor dropped mid-request');

  await test('a Qapla shipment status reaches the reply', async () => {
    await seedMock({ shipments: { AB123: { status: 'IN TRANSIT', result: 'OK', error: null } } });

    const requestId = newRequestId();
    await ask('/track', requestId);

    const texts = await textsFor(requestId, 1);
    assert.ok(texts, 'the bot must answer');
    assert.deepStrictEqual(texts, [
      'qapla status is: IN TRANSIT',
      'qapla error is: '
    ], 'the status DirQapla digs out of getShipment.shipments[0].status'
     + '.qaplaStatus.status, and no error');

    // The credential travels as a QUERY parameter for this vendor.
    const lookups = await recordedOfKind('qapla');
    assert.strictEqual(lookups.length, 1);
    assert.strictEqual(lookups[0].query.trackingNumber, 'AB123');
    assert.strictEqual(lookups[0].query.apiKey, 'an-inline-qapla-key');

    const state = await mockState();
    assert.strictEqual(state.vendors.qapla.lookups.length, 1,
      'and the mock kept it, so the outcome is assertable without the recording');
  });

  await test('the same vendor armed to `drop` leaves the flow moving and the worker alive', async () => {
    // `drop` destroys the socket with no status line at all: axios reports it
    // with no `error.response`, which is the shape that used to throw inside
    // the very handler written to report the failure.
    await armFailure({ method: 'GET', path: '/vendor/qapla/getShipment', mode: 'drop', times: 1 });

    const requestId = newRequestId();
    await ask('/track', requestId);

    const texts = await textsFor(requestId, 1);
    assert.ok(texts, 'the flow must not stall on a transport failure');
    assert.deepStrictEqual(texts, [
      'qapla status is: ',
      'qapla error is: Unable to get shipment'
    ], 'the directive carried on to the next action with its error assigned');

    const lookups = await recordedOfKind('qapla');
    const dropped = lookups.filter((c) => c.failure === 'drop');
    assert.strictEqual(dropped.length, 1, 'the drop was served on a real call');

    await assertStillHealthy('a dropped vendor request');
  });

  await test('a Whatsapp broadcast succeeds, and a 500 takes the false connector', async () => {
    const okRequestId = newRequestId();
    await ask('/notify', okRequestId);
    const okTexts = await textsFor(okRequestId, 1);
    assert.ok(okTexts);
    assert.deepStrictEqual(okTexts, ['whatsapp accepted'],
      'resbody.success === true is what DirSendWhatsapp branches on');

    const state = await mockState();
    assert.strictEqual(state.vendors.whatsapp.broadcasts.length, 1);
    const payload = state.vendors.whatsapp.broadcasts[0].payload;
    assert.strictEqual(payload.receiver_list[0].phone_number, '+393485566777');
    assert.strictEqual(payload.broadcast, false, 'the directive stamps broadcast:false');
    assert.strictEqual(payload.transaction_id, okRequestId,
      'and the request id, which is how the mock ties the call to the conversation');

    await armFailure({ method: 'POST', path: '/vendor/whatsapp/tiledesk/broadcast', mode: '500', times: 1 });
    const koRequestId = newRequestId();
    await ask('/notify', koRequestId);
    const koTexts = await textsFor(koRequestId, 1);
    assert.ok(koTexts, 'a failed broadcast must still answer the visitor');
    assert.deepStrictEqual(koTexts, ['whatsapp refused']);

    await assertStillHealthy('a failed whatsapp broadcast');
  });

  // ------------------------------------------------------------ journey 4
  section('journey 4 - an exhausted token quota changes what the connector does');

  await test('with no project key and isAvailable:false, the LLM is never called', async () => {
    // Drop the project key. LLMKeyService then falls back to the container's
    // GPTKEY and reports publicKey:true -- the ONLY path on which the quota is
    // consulted at all.
    await seedMock({
      integrations: { openai: { value: null } },
      quotas: { isAvailable: false }
    });

    const before = (await recordedOfKind('llm-qa')).length;

    const requestId = newRequestId();
    await ask('/ask_kb', requestId);

    // The quota must have been asked...
    const quotaAsked = await waitFor(async () => {
      const calls = await recordedOfKind('quotas');
      return calls.length > 0 ? calls : null;
    }, 15000);
    assert.ok(quotaAsked, 'the public key path must check the token quota');

    // ...and the answer must have stopped the action before it spent anything.
    await sleep(2500);
    const after = (await recordedOfKind('llm-qa')).length;
    assert.strictEqual(after, before,
      'no call to the LLM: an exhausted quota skips the action, which is the '
      + 'whole point of the check');

    const rec = await recordedFor(requestId);
    assert.deepStrictEqual(rec.messages, [],
      'and with the action skipped there is no connector to follow, so nothing '
      + 'is posted -- the same intent answered in journey 1');
  });

  await test('restore the quota and the very same intent answers again', async () => {
    await seedMock({
      quotas: { isAvailable: true },
      llm: { qa: { answer: 'answered on the public key', success: true } }
    });

    const requestId = newRequestId();
    await ask('/ask_kb', requestId);
    const texts = await textsFor(requestId, 1);
    assert.ok(texts, 'the bot answers once the quota is available');
    assert.strictEqual(texts[0], 'kb says: answered on the public key',
      'so journey 4 above really did turn on the quota and not on anything else');

    const asked = (await recordedOfKind('llm-qa')).slice(-1)[0];
    assert.strictEqual(asked.body.gptkey, 'integration-public-gptkey',
      'and it went out with the container\'s shared GPTKEY');
  });

  // ------------------------------------------------------------ journey 5
  section('journey 5 - every remaining endpoint, reached once by the real image');

  await test('the three CRM vendors are called, each on its own accepted status', async () => {
    await seedMock({
      integrations: {
        // The capital B is not a typo: DirBrevo asks the platform for the
        // integration named "Brevo", where every other directive here uses a
        // lowercase name.
        Brevo: { value: { apikey: 'a-brevo-key' } },
        hubspot: { value: { apikey: 'a-hubspot-key' } },
        customerio: { value: { apikey: 'a-customerio-key' } }
      }
    });

    const brevoId = newRequestId();
    await ask('/brevo', brevoId);
    const brevo = await textsFor(brevoId, 1);
    assert.ok(brevo, 'brevo must answer');
    assert.deepStrictEqual(brevo, ['brevo status is: 201', 'brevo error is: '],
      'BrevoService accepts 200 OR 201 and the mock answers a create with 201');

    const hubspotId = newRequestId();
    await ask('/hubspot', hubspotId);
    const hubspot = await textsFor(hubspotId, 1);
    assert.ok(hubspot, 'hubspot must answer');
    assert.deepStrictEqual(hubspot, ['hubspot status is: 201', 'hubspot error is: '],
      'and so does Hubspot -- reached through a base url whose TRAILING SLASH '
      + 'is the only separator in the path');

    const customerioId = newRequestId();
    await ask('/customerio', customerioId);
    const customerio = await textsFor(customerioId, 1);
    assert.ok(customerio, 'customerio must answer');
    assert.deepStrictEqual(customerio, ['customerio status is: 204', 'customerio error is: '],
      'Customer.io answers 204 with NO BODY, which only works because the '
      + 'service hands the request body back instead');

    const state = await mockState();
    assert.strictEqual(state.vendors.brevo.contacts.length, 1);
    assert.strictEqual(state.vendors.brevo.contacts[0].contact.email, 'ada@example.com',
      'the contact really reached Brevo, in Brevo\'s own envelope');
    assert.strictEqual(state.vendors.hubspot.contacts.length, 1);
    assert.strictEqual(state.vendors.hubspot.contacts[0].properties.firstname, 'Ada',
      'and the properties reached Hubspot through its single-element batch');
    assert.strictEqual(state.vendors.customerio.submissions.length, 1);
    assert.strictEqual(state.vendors.customerio.submissions[0].formId, 'form-integration-1');
    assert.strictEqual(state.vendors.customerio.submissions[0].data.email, 'ada@example.com');

    const keys = (await recordedOfKind('brevo'))[0];
    assert.strictEqual(keys.body.email, 'ada@example.com');
  });

  await test('a Make webhook is redirected to MAKE_ENDPOINT and answers plain text', async () => {
    const requestId = newRequestId();
    await ask('/make', requestId);
    const texts = await textsFor(requestId, 1);
    assert.ok(texts, 'make must answer');
    assert.deepStrictEqual(texts, ['make status is: 200', 'make error is: '],
      'MakeService checks no status and parses nothing: it hands the whole '
      + 'axios response back and DirMake reads `res.status` off it, so a '
      + 'plain-text 200 is a success');

    const state = await mockState();
    assert.strictEqual(state.vendors.make.triggers.length, 1,
      'the author\'s webhook url was ignored, as MAKE_ENDPOINT demands');
    assert.strictEqual(state.vendors.make.triggers[0].body.name, 'Ada');
  });

  await test('askgptv2 and ai_prompt reach KB_ENDPOINT_QA on their two different routes', async () => {
    await seedMock({
      // DirAskGPTV2's namespace defaults to the project id, and the model key
      // comes from the "openai" integration (journey 4 emptied it).
      namespaces: [{
        id: PROJECT_ID, name: 'Default', default: true, id_project: PROJECT_ID,
        engine: { name: 'pinecone', type: 'serverless', apikey: '', vector_size: 1536, index_name: 'example-index' }
      }],
      integrations: { openai: { value: { apikey: 'an-openai-key' } } },
      llm: {
        namespaceQa: {
          answer: 'the namespace answer',
          success: true,
          source: 'http://kb.integration/article',
          prompt_token_size: 762,
          content_chunks: ['chunk one']
        },
        ask: { answer: 'the prompt answer', chat_history_dict: {} }
      }
    });

    const nsId = newRequestId();
    await ask('/ask_namespace', nsId);
    const ns = await textsFor(nsId, 1);
    assert.ok(ns, 'askgptv2 must answer');
    assert.deepStrictEqual(ns, ['ns says: the namespace answer', 'ns source: http://kb.integration/article'],
      'DirAskGPTV2 branches on resbody.success === true and reads answer/source');

    const nsCalls = await recordedOfKind('llm-namespace-qa');
    assert.strictEqual(nsCalls.length, 1);
    assert.strictEqual(nsCalls[0].path, '/llm/qa/qa');
    assert.strictEqual(nsCalls[0].authorization, 'JWT XXX',
      'this is the one LLM route that carries the project JWT');
    assert.strictEqual(nsCalls[0].body.namespace, PROJECT_ID);

    // The answered question is written back to the platform, unawaited.
    const answered = await waitFor(async () => {
      const calls = await recordedOfKind('kb-answered');
      return calls.length > 0 ? calls : null;
    }, 10000);
    assert.ok(answered, 'and the answer is filed on /:projectId/kb/answered');
    assert.strictEqual(answered[0].body.answer, 'the namespace answer');

    const promptId = newRequestId();
    await ask('/prompt', promptId);
    const prompt = await textsFor(promptId, 1);
    assert.ok(prompt, 'ai_prompt must answer');
    assert.deepStrictEqual(prompt, ['prompt says: the prompt answer']);

    const askCalls = await recordedOfKind('llm-ask');
    assert.strictEqual(askCalls.length, 1);
    assert.strictEqual(askCalls[0].path, '/llm/qa/ask',
      'the SAME base url as askgptv2, on a different route -- which is why the '
      + 'two cannot share one prefix with KB_ENDPOINT');
    assert.strictEqual(askCalls[0].body.llm_key, 'an-openai-key');
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
    console.error('\n[ai] the run itself blew up:');
    console.error(err && err.stack ? err.stack : err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
