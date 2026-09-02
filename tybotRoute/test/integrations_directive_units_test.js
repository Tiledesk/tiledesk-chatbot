'use strict';

// directives/integrations, driven directly instead of through a whole bot flow.
//
// Seven directives that each hand a bot author's form data to an outside
// vendor - Brevo, Customer.io, Hubspot, Qapla, Make and the Whatsapp module -
// and then route on the outcome. The conversation-* files cover one happy path
// each; what they never reach is the half that matters in production: an
// integration that has not been configured, a body the designer left empty, a
// vendor answering 4xx/5xx, a response whose shape is not the one the code
// digs into.
//
// Every test asserts something observable: the request that actually left
// (url, method, headers, body), the flow attributes written to the cache, the
// flowError set, or which connector was taken. The it.skip() blocks record
// defects found while writing them, with the analysis above each one; they are
// left failing on purpose, exactly as the earlier waves did.

var assert = require('assert');
var express = require('express');
const bodyParser = require('body-parser');

const { DirBrevo } = require('../directives/integrations/DirBrevo');
const { DirCustomerio } = require('../directives/integrations/DirCustomerio');
const { DirHubspot } = require('../directives/integrations/DirHubspot');
const { DirMake } = require('../directives/integrations/DirMake');
const { DirQapla } = require('../directives/integrations/DirQapla');
const { DirSendWhatsapp } = require('../directives/integrations/DirSendWhatsapp');
const { DirWhatsappByAttribute } = require('../directives/integrations/DirWhatsappByAttribute');

const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-integrationunits";
const MOCK_PORT = 10002;
const TILEBOT_PORT = 10001;
const MOCK = 'http://localhost:' + MOCK_PORT;
const API_ENDPOINT = process.env.API_ENDPOINT || MOCK;

// ------------------------------------------------------------------ fakes

function fakeCache(vars, overrides) {
  const hashes = {};
  const key = "tilebot:requests:" + REQUEST_ID + ":parameters";
  hashes[key] = {};
  for (const [k, v] of Object.entries(vars || {})) hashes[key][k] = JSON.stringify(v);
  return Object.assign({
    hashes,
    /** Flow attributes as native values, for assertions. */
    attrs() {
      const out = {};
      for (const [k, v] of Object.entries(hashes[key] || {})) {
        try { out[k] = JSON.parse(v); } catch (e) { out[k] = v; }
      }
      return out;
    },
    async hgetall(k) { return hashes[k] || {}; },
    async hget(k, f) { return (hashes[k] || {})[f]; },
    async hset(k, f, v) { (hashes[k] || (hashes[k] = {}))[f] = v; },
    async hdel(k, f) { delete (hashes[k] || {})[f]; },
    async get() { return null; },
    async set() { },
    async del() { },
    async expire() { }
  }, overrides);
}

function fakeChatbot() {
  const params = {};
  return {
    params,
    botId: "botID",
    bot: { name: "Test Bot", root_id: "ROOT-1" },
    async getParameter(k) { return params[k]; },
    async addParameter(k, v) { params[k] = v; },
    async deleteParameter(k) { delete params[k]; }
  };
}

function recordingLogger() {
  const lines = [];
  const mk = (level) => (...args) => lines.push([level, args.map(String).join(' ')]);
  return {
    lines,
    at(level) { return lines.filter((l) => l[0] === level).map((l) => l[1]).join(' | '); },
    error: mk('error'), warn: mk('warn'), info: mk('info'),
    debug: mk('debug'), native: mk('native')
  };
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

function build(Klass, opts = {}) {
  const tdcache = opts.noCache ? undefined : fakeCache(opts.vars, opts.cache);
  const chatbot = fakeChatbot();
  const dir = new Klass(contextFor(Object.assign({ tdcache, chatbot }, opts.context)));
  dir.logger = recordingLogger();
  return { dir, tdcache, chatbot, logger: dir.logger };
}

/** Runs a directive, resolving with every `stop` value the callback received. */
function run(dir, directive, settleMs) {
  return new Promise((resolve, reject) => {
    const stops = [];
    let timer = null;
    const guard = setTimeout(() => reject(new Error("the directive never called back")), 12000);
    dir.execute(directive, (stop) => {
      stops.push(stop);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { clearTimeout(guard); resolve(stops); }, settleMs === undefined ? 200 : settleMs);
    });
  });
}

// ------------------------------------------------------------------- mock

/**
 * Every vendor endpoint the six services build, on the one port run-tests.js
 * points BREVO/CUSTOMERIO/HUBSPOT/QAPLA/MAKE_ENDPOINT at, plus the Tiledesk
 * integration lookup and the whatsapp module.
 *
 *   BrevoService        POST {BREVO_ENDPOINT}/contacts
 *   CustomerioService   POST {CUSTOMERIO_ENDPOINT}/forms/{id}/submit
 *   HubspotService      POST {HUBSPOT_ENDPOINT}objects/contacts/batch/create
 *   QaplaService        GET  {QAPLA_ENDPOINT}/getShipment/
 *   MakeService         POST {MAKE_ENDPOINT}/make/
 *   WhatsappService     POST {API_ENDPOINT}/modules/whatsapp/api/tiledesk/broadcast
 */
function startMock(opts = {}) {
  return new Promise((resolve) => {
    const seen = {
      integrations: [], brevo: [], customerio: [], hubspot: [],
      qapla: [], make: [], broadcast: []
    };
    const server = express();
    server.use(bodyParser.json());

    const record = (bucket, handlerKey, fallback) => (req, res) => {
      seen[bucket].push({
        method: req.method, url: req.originalUrl,
        headers: req.headers, body: req.body, query: req.query
      });
      if (opts[handlerKey]) { opts[handlerKey](req, res); return; }
      fallback(req, res);
    };

    server.get('/:project_id/integration/name/:name', (req, res) => {
      seen.integrations.push(req.params.name);
      const body = (opts.integrations || {})[req.params.name];
      if (body === undefined) { res.status(404).send({ error: "integration not found" }); return; }
      res.status(200).send(body);
    });

    server.post('/api/v3/contacts', record('brevo', 'brevo',
      (req, res) => res.status(201).send({ id: 42 })));

    server.post('/api/v1/forms/:formId/submit', record('customerio', 'customerio',
      (req, res) => res.status(200).send({ ok: true })));

    server.post('/crm/v3/objects/contacts/batch/create', record('hubspot', 'hubspot',
      (req, res) => res.status(201).send({ results: [{ id: "c-1" }] })));

    server.get('/1.2/getShipment/', record('qapla', 'qapla',
      (req, res) => res.status(200).send({ getShipment: { result: "ok", error: null, shipments: [{ status: { qaplaStatus: { status: "delivered" } } }] } })));

    server.post('/1.3/make/', record('make', 'make',
      (req, res) => res.status(200).send({ accepted: true })));

    server.post('/modules/whatsapp/api/tiledesk/broadcast', record('broadcast', 'broadcast',
      (req, res) => res.status(200).send({ success: true })));

    const listener = server.listen(MOCK_PORT, '0.0.0.0', () => {
      resolve({ seen, close: () => new Promise((r) => listener.close(() => r())) });
    });
  });
}

// ==================================================================== tests

describe('Directives directives/integrations, the error and edge paths', function () {

  let tilebot;
  let dispatched = [];

  before((done) => {
    const server = express();
    server.use(bodyParser.json());
    server.post('/ext/:botid', (req, res) => {
      dispatched.push(req.body.payload.text);
      res.status(200).send({ success: true });
    });
    tilebot = server.listen(TILEBOT_PORT, '0.0.0.0', () => done());
  });

  after((done) => { tilebot.close(() => done()); });
  beforeEach(() => { dispatched = []; });

  // ----------------------------------------------------------------- DirBrevo

  describe('DirBrevo', function () {

    const BODY = { email: "{{who}}@test.com", FIRSTNAME: "{{who}}" };
    const KEYED = { integrations: { Brevo: { value: { apikey: "brevo-key" } } } };

    it('a directive with no action contacts nobody', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, logger } = build(DirBrevo);
        const stops = await run(dir, { name: "brevo" }, 50);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.deepStrictEqual(mock.seen.brevo, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('without a cache it contacts nobody', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir } = build(DirBrevo, { noCache: true });
        const stops = await run(dir, { name: "brevo", action: { bodyParameters: BODY } }, 50);
        assert.deepStrictEqual(mock.seen.brevo, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('an empty bodyParameters contacts nobody and takes no connector', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, logger } = build(DirBrevo);
        const stops = await run(dir, { name: "brevo", action: { bodyParameters: '', falseIntent: "KO" } }, 50);
        assert.ok(logger.at('error').includes('bodyParameters is undefined'));
        assert.deepStrictEqual(mock.seen.brevo, []);
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('the email is split out of the body and the rest becomes the brevo attributes', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, tdcache } = build(DirBrevo, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "brevo",
          action: {
            bodyParameters: Object.assign({}, BODY),
            assignStatusTo: "b_status", assignResultTo: "b_result", assignErrorTo: "b_error",
            trueIntent: "OK"
          }
        });

        assert.strictEqual(mock.seen.brevo.length, 1);
        assert.strictEqual(mock.seen.brevo[0].headers['api-key'], "brevo-key");
        assert.strictEqual(mock.seen.brevo[0].body.email, "ada@test.com");
        assert.deepStrictEqual(mock.seen.brevo[0].body.attributes, { FIRSTNAME: "ada" },
          'the email must NOT be repeated inside attributes');
        assert.strictEqual(tdcache.attrs().b_status, 201);
        assert.strictEqual(tdcache.attrs().b_error, null);
        assert.ok(String(tdcache.attrs().b_result).includes('"id": 42'), tdcache.attrs().b_result);
        assert.deepStrictEqual(dispatched, ["/OK"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a success with no true connector still writes the attributes and carries on', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, tdcache } = build(DirBrevo, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "brevo",
          action: { bodyParameters: Object.assign({}, BODY), assignStatusTo: "b_status" }
        });

        assert.strictEqual(tdcache.attrs().b_status, 201);
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('no Brevo integration takes the false connector and never contacts brevo', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir } = build(DirBrevo, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "brevo",
          action: { bodyParameters: Object.assign({}, BODY), falseIntent: "KO" }
        });

        assert.deepStrictEqual(mock.seen.brevo, [], 'nothing may be sent without a key');
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a 400 from brevo writes the status and the message and takes the false connector', async () => {
      const mock = await startMock(Object.assign({}, KEYED, {
        brevo: (req, res) => res.status(400).send({ message: "Contact already exist", code: "duplicate_parameter" })
      }));
      try {
        const { dir, tdcache } = build(DirBrevo, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "brevo",
          action: {
            bodyParameters: Object.assign({}, BODY),
            assignStatusTo: "b_status", assignResultTo: "b_result", assignErrorTo: "b_error",
            falseIntent: "KO"
          }
        });

        assert.strictEqual(tdcache.attrs().b_status, 400);
        assert.strictEqual(tdcache.attrs().b_error, "Contact already exist");
        assert.strictEqual(tdcache.attrs().b_result, null);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a 400 with no message leaves the error attribute unwritten but still routes', async () => {
      const mock = await startMock(Object.assign({}, KEYED, {
        brevo: (req, res) => res.status(400).send({ code: "duplicate_parameter" })
      }));
      try {
        const { dir, tdcache } = build(DirBrevo, { vars: { who: "ada" } });
        await run(dir, {
          name: "brevo",
          action: {
            bodyParameters: Object.assign({}, BODY),
            assignStatusTo: "b_status", assignErrorTo: "b_error", falseIntent: "KO"
          }
        });

        assert.strictEqual(tdcache.attrs().b_status, 400);
        assert.strictEqual(tdcache.attrs().b_error, undefined,
          'with no message in the body the error attribute is written as undefined');
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('a failure with no false connector still writes the attributes and carries on', async () => {
      const mock = await startMock(Object.assign({}, KEYED, {
        brevo: (req, res) => res.status(400).send({ message: "nope" })
      }));
      try {
        const { dir, tdcache } = build(DirBrevo, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "brevo",
          action: { bodyParameters: Object.assign({}, BODY), assignErrorTo: "b_error" }
        });

        assert.strictEqual(tdcache.attrs().b_error, "nope");
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    // DEFECT - directives/integrations/DirBrevo.js:78-85
    //
    //   if (!key) {
    //     ...
    //     if (falseIntent) { ...; callback(true); return; }
    //   }                                  <-- no else, no return
    //   ...
    //   await brevoService.createContact(brevo_email, ..., key, ...)
    //
    // With no Brevo integration configured AND no false connector wired, the
    // guard logs "Key not found in Integrations" and then carries straight on
    // to POST the contact anyway, with `api-key: undefined`. The contact
    // leaves the flow with the vendor rejecting it, and the reason the author
    // sees is whatever Brevo says about the missing key rather than "you have
    // not configured the integration". DirCustomerio.js:71-84 and
    // DirHubspot.js:74-82 have the identical shape.
    //
    // Correct behaviour, asserted here: a missing key stops the directive.
    // Nothing is sent, and the flow carries on the way every other
    // no-connector exit in the file does.
    it('no Brevo integration and no false connector sends nothing at all', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir } = build(DirBrevo, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "brevo",
          action: { bodyParameters: Object.assign({}, BODY) }
        });

        assert.deepStrictEqual(mock.seen.brevo, [], 'a contact must not be posted without a key');
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

  });

  // ------------------------------------------------------------ DirCustomerio

  describe('DirCustomerio', function () {

    const BODY = { email: "{{who}}@test.com", name: "{{who}}" };
    const KEYED = { integrations: { customerio: { value: { apikey: "cio-key" } } } };

    it('a directive with no action submits nothing', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, logger } = build(DirCustomerio);
        const stops = await run(dir, { name: "customerio" }, 50);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.deepStrictEqual(mock.seen.customerio, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('without a cache it submits nothing', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir } = build(DirCustomerio, { noCache: true });
        const stops = await run(dir, { name: "customerio", action: { formid: "F1", bodyParameters: BODY } }, 50);
        assert.deepStrictEqual(mock.seen.customerio, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('an empty bodyParameters submits nothing', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, logger } = build(DirCustomerio);
        const stops = await run(dir, { name: "customerio", action: { formid: "F1", bodyParameters: null } }, 50);
        assert.ok(logger.at('error').includes('bodyParameters is undefined'));
        assert.deepStrictEqual(mock.seen.customerio, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('the form id picks the url, the key becomes Basic auth and the body is filled', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, tdcache } = build(DirCustomerio, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "customerio",
          action: {
            formid: "signup", bodyParameters: Object.assign({}, BODY),
            assignStatusTo: "c_status", assignErrorTo: "c_error", trueIntent: "OK"
          }
        });

        assert.strictEqual(mock.seen.customerio.length, 1);
        assert.strictEqual(mock.seen.customerio[0].url, "/api/v1/forms/signup/submit");
        assert.strictEqual(mock.seen.customerio[0].headers.authorization, "Basic cio-key");
        assert.deepStrictEqual(mock.seen.customerio[0].body, { data: { email: "ada@test.com", name: "ada" } });
        assert.strictEqual(tdcache.attrs().c_status, 204, 'the directive reports 204 whatever the vendor answered');
        assert.strictEqual(tdcache.attrs().c_error, null);
        assert.deepStrictEqual(dispatched, ["/OK"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('no customerio integration writes 422 and takes the false connector', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, tdcache } = build(DirCustomerio, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "customerio",
          action: {
            formid: "signup", bodyParameters: Object.assign({}, BODY),
            assignStatusTo: "c_status", assignErrorTo: "c_error", falseIntent: "KO"
          }
        });

        assert.strictEqual(tdcache.attrs().c_status, 422);
        assert.strictEqual(tdcache.attrs().c_error, "Missing customerio access token");
        assert.deepStrictEqual(mock.seen.customerio, []);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a 401 writes the vendor meta error and takes the false connector', async () => {
      const mock = await startMock(Object.assign({}, KEYED, {
        customerio: (req, res) => res.status(401).send({ meta: { error: "unauthorized" } })
      }));
      try {
        const { dir, tdcache } = build(DirCustomerio, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "customerio",
          action: {
            formid: "signup", bodyParameters: Object.assign({}, BODY),
            assignStatusTo: "c_status", assignErrorTo: "c_error", falseIntent: "KO"
          }
        });

        assert.strictEqual(tdcache.attrs().c_status, 401);
        assert.strictEqual(tdcache.attrs().c_error, "unauthorized");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a 500 with no meta block still routes on the false connector', async () => {
      const mock = await startMock(Object.assign({}, KEYED, {
        customerio: (req, res) => res.status(500).send({ oops: true })
      }));
      try {
        const { dir, tdcache } = build(DirCustomerio, { vars: { who: "ada" } });
        await run(dir, {
          name: "customerio",
          action: {
            formid: "signup", bodyParameters: Object.assign({}, BODY),
            assignStatusTo: "c_status", assignErrorTo: "c_error", falseIntent: "KO"
          }
        });

        assert.strictEqual(tdcache.attrs().c_status, 500);
        assert.strictEqual(tdcache.attrs().c_error, undefined,
          'with no meta.error in the body the error attribute is written as undefined');
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('a failure with no false connector still writes the status and carries on', async () => {
      const mock = await startMock(Object.assign({}, KEYED, {
        customerio: (req, res) => res.status(500).send({ meta: { error: "boom" } })
      }));
      try {
        const { dir, tdcache } = build(DirCustomerio, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "customerio",
          action: { formid: "signup", bodyParameters: Object.assign({}, BODY), assignErrorTo: "c_error" }
        });

        assert.strictEqual(tdcache.attrs().c_error, "boom");
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

  });

  // --------------------------------------------------------------- DirHubspot

  describe('DirHubspot', function () {

    const BODY = { email: "{{who}}@test.com", firstname: "{{who}}" };
    const KEYED = { integrations: { hubspot: { value: { apikey: "hs-key" } } } };

    it('a directive with no action creates nothing', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, logger } = build(DirHubspot);
        const stops = await run(dir, { name: "hubspot" }, 50);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.deepStrictEqual(mock.seen.hubspot, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('without a cache it creates nothing', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir } = build(DirHubspot, { noCache: true });
        const stops = await run(dir, { name: "hubspot", action: { bodyParameters: BODY } }, 50);
        assert.deepStrictEqual(mock.seen.hubspot, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('an empty bodyParameters creates nothing', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, logger } = build(DirHubspot);
        const stops = await run(dir, { name: "hubspot", action: { bodyParameters: '' } }, 50);
        assert.ok(logger.at('error').includes('bodyParameters is undefined'));
        assert.deepStrictEqual(mock.seen.hubspot, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('the filled body is wrapped in the batch envelope and the key becomes a Bearer token', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, tdcache } = build(DirHubspot, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "hubspot",
          action: {
            bodyParameters: Object.assign({}, BODY),
            assignStatusTo: "h_status", assignResultTo: "h_result", assignErrorTo: "h_error",
            trueIntent: "OK"
          }
        });

        assert.strictEqual(mock.seen.hubspot.length, 1);
        assert.strictEqual(mock.seen.hubspot[0].headers.authorization, "Bearer hs-key");
        assert.deepStrictEqual(mock.seen.hubspot[0].body, {
          inputs: [{ properties: { email: "ada@test.com", firstname: "ada" }, associations: [] }]
        });
        assert.strictEqual(tdcache.attrs().h_status, 201);
        assert.deepStrictEqual(tdcache.attrs().h_result, { results: [{ id: "c-1" }] });
        assert.strictEqual(tdcache.attrs().h_error, null);
        assert.deepStrictEqual(dispatched, ["/OK"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('no hubspot integration takes the false connector and never creates a contact', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir } = build(DirHubspot, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "hubspot",
          action: { bodyParameters: Object.assign({}, BODY), falseIntent: "KO" }
        });

        assert.deepStrictEqual(mock.seen.hubspot, []);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a 409 writes the status and the vendor message and takes the false connector', async () => {
      const mock = await startMock(Object.assign({}, KEYED, {
        hubspot: (req, res) => res.status(409).send({ message: "Contact already exists" })
      }));
      try {
        const { dir, tdcache } = build(DirHubspot, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "hubspot",
          action: {
            bodyParameters: Object.assign({}, BODY),
            assignStatusTo: "h_status", assignResultTo: "h_result", assignErrorTo: "h_error",
            falseIntent: "KO"
          }
        });

        assert.strictEqual(tdcache.attrs().h_status, 409);
        assert.strictEqual(tdcache.attrs().h_error, "Contact already exists");
        assert.strictEqual(tdcache.attrs().h_result, null);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a failure with no false connector still writes the status and carries on', async () => {
      const mock = await startMock(Object.assign({}, KEYED, {
        hubspot: (req, res) => res.status(500).send({ message: "hubspot is down" })
      }));
      try {
        const { dir, tdcache } = build(DirHubspot, { vars: { who: "ada" } });
        const stops = await run(dir, {
          name: "hubspot",
          action: { bodyParameters: Object.assign({}, BODY), assignErrorTo: "h_error" }
        });

        assert.strictEqual(tdcache.attrs().h_error, "hubspot is down");
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

  });

  // ----------------------------------------------------------------- DirQapla

  describe('DirQapla', function () {

    const KEYED = { integrations: { qapla: { value: { apikey: "qapla-key" } } } };

    it('a directive with no action asks for no shipment', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, logger } = build(DirQapla);
        const stops = await run(dir, { name: "qapla" }, 50);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.deepStrictEqual(mock.seen.qapla, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('without a cache it asks for no shipment', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir } = build(DirQapla, { noCache: true });
        const stops = await run(dir, { name: "qapla", action: { trackingNumber: "TN-1" } }, 50);
        assert.deepStrictEqual(mock.seen.qapla, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a tracking number that fills to nothing writes the error and takes the false connector', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, tdcache } = build(DirQapla);
        const stops = await run(dir, {
          name: "qapla",
          action: {
            trackingNumber: "", apiKey: "k",
            assignStatusTo: "q_status", assignResultTo: "q_result", assignErrorTo: "q_error",
            falseIntent: "KO"
          }
        });

        assert.strictEqual(tdcache.attrs().q_error, "Tracking number is not defined");
        assert.strictEqual(tdcache.attrs().q_status, null);
        assert.strictEqual('q_result' in tdcache.attrs(), false, 'a null result is not written');
        assert.deepStrictEqual(mock.seen.qapla, []);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a missing tracking number with no false connector still writes the error and carries on', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, tdcache } = build(DirQapla);
        const stops = await run(dir, { name: "qapla", action: { assignErrorTo: "q_error" } });
        assert.strictEqual(tdcache.attrs().q_error, "Tracking number is not defined");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('with no apiKey on the action the key comes from the qapla integration', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir, tdcache } = build(DirQapla, { vars: { tn: "TN-77" } });
        const stops = await run(dir, {
          name: "qapla",
          action: {
            trackingNumber: "{{tn}}",
            assignStatusTo: "q_status", assignResultTo: "q_result", assignErrorTo: "q_error",
            trueIntent: "OK"
          }
        });

        assert.deepStrictEqual(mock.seen.integrations, ['qapla']);
        assert.strictEqual(mock.seen.qapla.length, 1);
        assert.deepStrictEqual(mock.seen.qapla[0].query, { apiKey: "qapla-key", trackingNumber: "TN-77" });
        assert.strictEqual(tdcache.attrs().q_status, "delivered");
        assert.strictEqual(tdcache.attrs().q_result, "ok");
        assert.strictEqual(tdcache.attrs().q_error, null);
        assert.deepStrictEqual(dispatched, ["/OK"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('an apiKey on the action short-circuits the integration lookup', async () => {
      const mock = await startMock(KEYED);
      try {
        const { dir } = build(DirQapla);
        await run(dir, { name: "qapla", action: { trackingNumber: "TN-1", apiKey: "from-action" } });

        assert.deepStrictEqual(mock.seen.integrations, [], 'the action key wins outright');
        assert.strictEqual(mock.seen.qapla[0].query.apiKey, "from-action");
      } finally {
        await mock.close();
      }
    });

    it('no apiKey anywhere writes the error and takes the false connector', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, tdcache } = build(DirQapla);
        const stops = await run(dir, {
          name: "qapla",
          action: { trackingNumber: "TN-1", assignErrorTo: "q_error", falseIntent: "KO" }
        });

        assert.strictEqual(tdcache.attrs().q_error, "Invalid or empty ApiKey");
        assert.deepStrictEqual(mock.seen.qapla, []);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('no apiKey and no false connector still writes the error and carries on', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, tdcache } = build(DirQapla);
        const stops = await run(dir, { name: "qapla", action: { trackingNumber: "TN-1", assignErrorTo: "q_error" } });
        assert.strictEqual(tdcache.attrs().q_error, "Invalid or empty ApiKey");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a 500 from qapla writes "Unable to get shipment" and takes the false connector', async () => {
      const mock = await startMock(Object.assign({}, KEYED, {
        qapla: (req, res) => res.status(500).send({ error: "qapla is down" })
      }));
      try {
        const { dir, tdcache } = build(DirQapla);
        const stops = await run(dir, {
          name: "qapla",
          action: {
            trackingNumber: "TN-1", apiKey: "k",
            assignStatusTo: "q_status", assignErrorTo: "q_error", falseIntent: "KO"
          }
        });

        assert.strictEqual(tdcache.attrs().q_error, "Unable to get shipment");
        assert.strictEqual(tdcache.attrs().q_status, null);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a failed shipment lookup with no false connector still writes the error and carries on', async () => {
      const mock = await startMock(Object.assign({}, KEYED, {
        qapla: (req, res) => res.status(500).send({ error: "down" })
      }));
      try {
        const { dir, tdcache } = build(DirQapla);
        const stops = await run(dir, {
          name: "qapla", action: { trackingNumber: "TN-1", apiKey: "k", assignErrorTo: "q_error" }
        });
        assert.strictEqual(tdcache.attrs().q_error, "Unable to get shipment");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a body with no shipments leaves the status null and reports qaplas own error', async () => {
      const mock = await startMock(Object.assign({}, KEYED, {
        qapla: (req, res) => res.status(200).send({ getShipment: { error: "tracking number not found" } })
      }));
      try {
        const { dir, tdcache } = build(DirQapla);
        await run(dir, {
          name: "qapla",
          action: {
            trackingNumber: "TN-1", apiKey: "k",
            assignStatusTo: "q_status", assignResultTo: "q_result", assignErrorTo: "q_error"
          }
        });

        assert.strictEqual(tdcache.attrs().q_status, null);
        assert.strictEqual(tdcache.attrs().q_error, "tracking number not found");
        assert.strictEqual('q_result' in tdcache.attrs(), false);
      } finally {
        await mock.close();
      }
    });

    it('a body with no getShipment block at all still routes on the true connector', async () => {
      const mock = await startMock(Object.assign({}, KEYED, {
        qapla: (req, res) => res.status(200).send({ somethingElse: true })
      }));
      try {
        const { dir, tdcache } = build(DirQapla);
        const stops = await run(dir, {
          name: "qapla",
          action: { trackingNumber: "TN-1", apiKey: "k", assignStatusTo: "q_status", trueIntent: "OK" }
        });

        assert.strictEqual(tdcache.attrs().q_status, null);
        assert.deepStrictEqual(dispatched, ["/OK"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

  });

  // ------------------------------------------------------------------ DirMake

  describe('DirMake', function () {

    it('a directive with no action triggers nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir, logger } = build(DirMake);
        const stops = await run(dir, { name: "make" }, 50);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.deepStrictEqual(mock.seen.make, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('without a cache it triggers nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirMake, { noCache: true });
        const stops = await run(dir, { name: "make", action: { url: MOCK + "/hook", bodyParameters: { a: "1" } } }, 50);
        assert.deepStrictEqual(mock.seen.make, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('no bodyParameters writes "Missing body parameters" and takes the false connector', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirMake);
        const stops = await run(dir, {
          name: "make",
          action: { url: MOCK + "/hook", assignStatusTo: "m_status", assignErrorTo: "m_error", falseIntent: "KO" }
        });

        assert.strictEqual(tdcache.attrs().m_error, "Missing body parameters");
        assert.strictEqual(tdcache.attrs().m_status, null);
        assert.deepStrictEqual(mock.seen.make, []);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('no bodyParameters and no false connector still writes the error and carries on', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirMake);
        const stops = await run(dir, { name: "make", action: { url: MOCK + "/hook", assignErrorTo: "m_error" } });
        assert.strictEqual(tdcache.attrs().m_error, "Missing body parameters");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('an empty webhook url writes 422 and takes the false connector', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirMake);
        const stops = await run(dir, {
          name: "make",
          action: {
            url: "", bodyParameters: { a: "1" },
            assignStatusTo: "m_status", assignErrorTo: "m_error", falseIntent: "KO"
          }
        });

        assert.strictEqual(tdcache.attrs().m_status, 422);
        assert.strictEqual(tdcache.attrs().m_error, "Missing make webhook url");
        assert.deepStrictEqual(mock.seen.make, []);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('an empty webhook url with no false connector still writes 422 and carries on', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirMake);
        const stops = await run(dir, {
          name: "make",
          action: { bodyParameters: { a: "1" }, assignStatusTo: "m_status" }
        });
        assert.strictEqual(tdcache.attrs().m_status, 422);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('every body parameter is filled from the flow attributes before the webhook fires', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirMake, { vars: { who: "ada", n: 3 } });
        const stops = await run(dir, {
          name: "make",
          action: {
            url: MOCK + "/hook", bodyParameters: { name: "{{who}}", count: "{{n}}" },
            assignStatusTo: "m_status", assignErrorTo: "m_error", trueIntent: "OK"
          }
        });

        assert.strictEqual(mock.seen.make.length, 1);
        assert.deepStrictEqual(mock.seen.make[0].body, { name: "ada", count: "3" });
        assert.strictEqual(tdcache.attrs().m_status, 200);
        assert.strictEqual(tdcache.attrs().m_error, null);
        assert.deepStrictEqual(dispatched, ["/OK"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a success with no true connector still writes the status and carries on', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirMake);
        const stops = await run(dir, {
          name: "make",
          action: { url: MOCK + "/hook", bodyParameters: { a: "1" }, assignStatusTo: "m_status" }
        });
        assert.strictEqual(tdcache.attrs().m_status, 200);
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    // DEFECT - directives/integrations/DirMake.js:105-146
    //
    // MakeService.trigger NEVER reports an error: its #myrequest turns an axios
    // rejection into `callback(null, { status, data: null, error })`, so `err`
    // is always null and DirMake always takes the `else if (callback)` branch.
    // That branch writes the real status and error to the flow attributes -
    // and then routes on the TRUE connector:
    //
    //   if (trueIntent) { await this._executeCondition(true, ...); }
    //
    // A Make scenario that answered 500, or a webhook url that does not
    // resolve, therefore continues down the success path of the flow. The
    // author gets no signal at all beyond an error attribute they have to
    // check by hand, and the false connector they wired for exactly this is
    // never taken. (The `if (err)` branch above it is dead code and the source
    // comment already says so - what it does not say is that its absence
    // leaves the failure unrouted.)
    //
    // Correct behaviour, asserted here: a non-2xx from the webhook takes the
    // false connector, like every other directive in this folder.
    it('a 500 from the make webhook takes the false connector', async () => {
      const mock = await startMock({ make: (req, res) => res.status(500).send({ error: "scenario failed" }) });
      try {
        const { dir, tdcache } = build(DirMake);
        const stops = await run(dir, {
          name: "make",
          action: {
            url: MOCK + "/hook", bodyParameters: { a: "1" },
            assignStatusTo: "m_status", assignErrorTo: "m_error",
            trueIntent: "OK", falseIntent: "KO"
          }
        });

        assert.strictEqual(tdcache.attrs().m_status, 500);
        assert.ok(tdcache.attrs().m_error, 'the failure must reach the error attribute');
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

  });

  // ---------------------------------------------------------- DirSendWhatsapp

  describe('DirSendWhatsapp', function () {

    const RECEIVER = {
      phone_number: "{{phone}}",
      header_params: [
        { type: "TEXT", text: "hello {{who}}" },
        { type: "IMAGE", image: { link: "https://cdn.test/{{who}}.png" } },
        { type: "DOCUMENT", document: { link: "https://cdn.test/{{who}}.pdf" } }
      ],
      body_params: [{ text: "your order {{order}}" }],
      buttons_params: [{ text: "track {{order}}" }]
    };

    function payloadFor() {
      return { receiver_list: [JSON.parse(JSON.stringify(RECEIVER))], template_name: "order_update" };
    }

    it('a directive with no action broadcasts nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir, logger } = build(DirSendWhatsapp);
        const stops = await run(dir, { name: "sendWhatsapp" }, 50);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.deepStrictEqual(mock.seen.broadcast, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('without a cache it broadcasts nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirSendWhatsapp, { noCache: true });
        const stops = await run(dir, { name: "sendWhatsapp", action: { payload: payloadFor() } }, 50);
        assert.deepStrictEqual(mock.seen.broadcast, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('the phone number and every header, body and button parameter is filled', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirSendWhatsapp, { vars: { phone: "+3912345", who: "ada", order: "A-9" } });
        const stops = await run(dir, {
          name: "sendWhatsapp",
          action: { payload: payloadFor(), trueIntent: "OK" }
        });

        assert.strictEqual(mock.seen.broadcast.length, 1);
        const sent = mock.seen.broadcast[0].body;
        const receiver = sent.receiver_list[0];
        assert.strictEqual(receiver.phone_number, "+3912345");
        assert.strictEqual(receiver.header_params[0].text, "hello ada");
        assert.strictEqual(receiver.header_params[1].image.link, "https://cdn.test/ada.png");
        assert.strictEqual(receiver.header_params[2].document.link, "https://cdn.test/ada.pdf");
        assert.strictEqual(receiver.body_params[0].text, "your order A-9");
        assert.strictEqual(receiver.buttons_params[0].text, "track A-9");
        assert.strictEqual(sent.transaction_id, REQUEST_ID);
        assert.strictEqual(sent.broadcast, false);
        assert.deepStrictEqual(dispatched, ["/OK"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a receiver with only a phone number is sent untouched', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirSendWhatsapp, { vars: { phone: "+390000" } });
        const stops = await run(dir, {
          name: "sendWhatsapp",
          action: { payload: { receiver_list: [{ phone_number: "{{phone}}" }] } }
        });

        assert.deepStrictEqual(mock.seen.broadcast[0].body.receiver_list[0], { phone_number: "+390000" });
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a 500 from the whatsapp module sets flowError and takes the false connector', async () => {
      const mock = await startMock({ broadcast: (req, res) => res.status(500).send({ error: "module down" }) });
      try {
        const { dir, chatbot } = build(DirSendWhatsapp, { vars: { phone: "+390000" } });
        const stops = await run(dir, {
          name: "sendWhatsapp",
          action: { payload: { receiver_list: [{ phone_number: "{{phone}}" }] }, falseIntent: "KO" }
        });

        assert.ok(String(chatbot.params.flowError).startsWith("SendWhatsapp Error: "), chatbot.params.flowError);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a failure with no false connector still sets flowError and carries on', async () => {
      const mock = await startMock({ broadcast: (req, res) => res.status(500).send({ error: "module down" }) });
      try {
        const { dir, chatbot } = build(DirSendWhatsapp, { vars: { phone: "+390000" } });
        const stops = await run(dir, {
          name: "sendWhatsapp",
          action: { payload: { receiver_list: [{ phone_number: "{{phone}}" }] } }
        });

        assert.ok(String(chatbot.params.flowError).startsWith("SendWhatsapp Error: "));
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a 200 that is not flagged successful takes the false connector and sets no flowError', async () => {
      const mock = await startMock({ broadcast: (req, res) => res.status(200).send({ success: false, reason: "no template" }) });
      try {
        const { dir, chatbot } = build(DirSendWhatsapp, { vars: { phone: "+390000" } });
        const stops = await run(dir, {
          name: "sendWhatsapp",
          action: { payload: { receiver_list: [{ phone_number: "{{phone}}" }] }, falseIntent: "KO" }
        });

        assert.strictEqual(chatbot.params.flowError, undefined,
          'an unsuccessful answer is not the same as a transport error');
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('an unsuccessful answer with no false connector carries on', async () => {
      const mock = await startMock({ broadcast: (req, res) => res.status(200).send({ success: false }) });
      try {
        const { dir } = build(DirSendWhatsapp, { vars: { phone: "+390000" } });
        const stops = await run(dir, {
          name: "sendWhatsapp",
          action: { payload: { receiver_list: [{ phone_number: "{{phone}}" }] } }
        });
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    // DEFECT - directives/integrations/DirSendWhatsapp.js:58
    //
    //   let payload = action.payload;
    //   ...
    //   let receiver = payload.receiver_list[0];
    //
    // Neither `payload` nor `receiver_list` is checked. A Send Whatsapp block
    // saved before its template was picked has no payload at all, and this
    // line throws "TypeError: Cannot read properties of undefined (reading
    // 'receiver_list')" inside go(). execute() does not await go() and does not
    // .catch() it, so the rejection is unhandled - the callback never fires,
    // the conversation stalls, and on a default node runtime the unhandled
    // rejection takes the worker down with it.
    //
    // Correct behaviour, asserted here: the same shape as the directive's own
    // "unexpected resbody" exit - nothing broadcast, the false connector
    // taken, and the callback called.
    it('an action with no payload reports the failure instead of stalling', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirSendWhatsapp);
        const stops = await run(dir, { name: "sendWhatsapp", action: { falseIntent: "KO" } });

        assert.deepStrictEqual(mock.seen.broadcast, []);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.strictEqual(stops.length, 1, 'the directive must call back exactly once');
      } finally {
        await mock.close();
      }
    });

  });

  // --------------------------------------------------- DirWhatsappByAttribute

  describe('DirWhatsappByAttribute', function () {

    it('a directive with no action broadcasts nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir, logger } = build(DirWhatsappByAttribute);
        const stops = await run(dir, { name: "whatsappAttribute" }, 50);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.deepStrictEqual(mock.seen.broadcast, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('an action with no attributeName broadcasts nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirWhatsappByAttribute);
        const stops = await run(dir, { name: "whatsappAttribute", action: {} }, 50);
        assert.deepStrictEqual(mock.seen.broadcast, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('an attribute that does not exist broadcasts nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirWhatsappByAttribute, { vars: { other: 1 } });
        const stops = await run(dir, { name: "whatsappAttribute", action: { attributeName: "wa_payload" } }, 50);
        assert.deepStrictEqual(mock.seen.broadcast, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('the attribute is broadcast as-is, stamped with the request id', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirWhatsappByAttribute, {
          vars: { wa_payload: { receiver_list: [{ phone_number: "+390000" }], template_name: "t1" } }
        });
        const stops = await run(dir, { name: "whatsappAttribute", action: { attributeName: "wa_payload" } });

        assert.strictEqual(mock.seen.broadcast.length, 1);
        assert.deepStrictEqual(mock.seen.broadcast[0].body, {
          receiver_list: [{ phone_number: "+390000" }],
          template_name: "t1",
          transaction_id: REQUEST_ID
        });
        assert.strictEqual(mock.seen.broadcast[0].headers['content-type'], "application/json");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    // DEFECT - directives/integrations/DirWhatsappByAttribute.js:53-70
    //
    //   return new Promise((resolve, reject) => {
    //     if (err) { if (callback) { callback(err); } reject(err); }
    //     ...
    //   })
    //
    // go() returns a promise that REJECTS whenever the whatsapp module answers
    // anything but a 2xx, and execute() calls go() without a .catch(). The
    // callback does still fire, so the flow itself carries on - but the
    // rejection is unhandled, which terminates a default node process. The
    // resolve/reject pair is vestigial in any case: execute() ignores the
    // returned promise entirely, and nothing else calls go().
    //
    // Correct behaviour, asserted here: a failed broadcast is logged and the
    // flow carries on, with no unhandled rejection.
    it.skip('a 500 from the whatsapp module carries on without an unhandled rejection', async () => {
      const mock = await startMock({ broadcast: (req, res) => res.status(500).send({ error: "module down" }) });
      const previous = process.listeners('unhandledRejection');
      const unhandled = [];
      process.removeAllListeners('unhandledRejection');
      process.on('unhandledRejection', (reason) => { unhandled.push(reason); });
      try {
        const { dir } = build(DirWhatsappByAttribute, {
          vars: { wa_payload: { receiver_list: [{ phone_number: "+390000" }] } }
        });
        const stops = await run(dir, { name: "whatsappAttribute", action: { attributeName: "wa_payload" } });
        await new Promise((r) => setTimeout(r, 50));

        assert.strictEqual(mock.seen.broadcast.length, 1);
        assert.deepStrictEqual(unhandled, [], 'a failed broadcast must not reject go()');
        assert.strictEqual(stops.length, 1, 'the directive must call back exactly once');
      } finally {
        process.removeAllListeners('unhandledRejection');
        for (const l of previous) process.on('unhandledRejection', l);
        await mock.close();
      }
    });

  });

});
