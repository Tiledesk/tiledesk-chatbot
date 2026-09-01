'use strict';

// observability/Logger, with flow logs actually ON.
//
// Logger reads FLOW_LOGS_ENABLED, AMQP_MANAGER_URL and LOGS_BASE_ROUTING_KEY
// into module-level consts at REQUIRE time and, when any of them is missing,
// replaces all five log methods with empty functions. Every other file in the
// suite runs with them unset, which is why the whole publishing half of the
// class was unrun. They are set here, before the requires, and scoped to this
// file - they are deployment settings, not suite-wide ones.
//
// Nothing talks to a real broker: the Publisher class the module instantiates
// at load time has its `publish` replaced on the PROTOTYPE before Logger is
// required, so the instance Logger holds is the stubbed one. The constructor
// itself only stores config (see JobManager), so no connection is opened.
process.env.FLOW_LOGS_ENABLED = 'true';
process.env.AMQP_MANAGER_URL = 'amqp://logger-units.invalid:5672';
process.env.LOGS_BASE_ROUTING_KEY = 'test.tilechat.logs';

var assert = require('assert');

const published = [];
const multiWorker = require('@tiledesk/tiledesk-multi-worker');
const originalPublish = multiWorker.Publisher.prototype.publish;
multiWorker.Publisher.prototype.publish = function (data, topic) { published.push({ data, topic }); };

const { Logger } = require('../observability/Logger');

const REQUEST_ID = "support-group-P1-loggerunits";

describe('observability/Logger, with flow logs enabled', function () {

  after(function () { multiWorker.Publisher.prototype.publish = originalPublish; });
  beforeEach(function () { published.length = 0; });

  it('a Logger with no config at all is refused', function () {
    assert.throws(() => new Logger(), /config is mandatory/);
    assert.throws(() => new Logger(null), /config is mandatory/);
  });

  it('a Logger with no request_id publishes nothing, whatever is logged through it', function () {
    const was = console.error;
    const complaints = [];
    console.error = (...args) => complaints.push(args.join(' '));
    try {
      const logger = new Logger({});
      logger.error("boom");
      logger.warn("careful");
      logger.info("fyi");
      logger.debug("detail");
      logger.native("step");

      assert.deepStrictEqual(published, [], 'a log with no request to attach to must not be published');
      assert.ok(complaints.join(' ').includes('config.request_id is mandatory'), complaints.join(' '));
    } finally {
      console.error = was;
    }
  });

  it('error, warn and info publish one message each, at their own level', function () {
    const logger = new Logger({ request_id: REQUEST_ID });
    logger.error("it broke");
    logger.warn("careful");
    logger.info("fyi");

    assert.deepStrictEqual(published.map((p) => p.data.level), ['error', 'warn', 'info']);
    assert.deepStrictEqual(published.map((p) => p.data.nlevel), [0, 1, 2]);
    assert.deepStrictEqual(published.map((p) => p.data.text), ["it broke", "careful", "fyi"]);
  });

  it('the published message carries the request, the project and the intent', function () {
    const logger = new Logger({ request_id: REQUEST_ID, intent_id: "i-1" });
    logger.info("hello");

    const { data, topic } = published[0];
    assert.strictEqual(data.request_id, REQUEST_ID);
    assert.strictEqual(data.id_project, "P1", 'the project is the third segment of the request id');
    assert.strictEqual(data.intent_id, "i-1");
    assert.strictEqual(data.dev, false);
    assert.ok(data.timestamp instanceof Date);
    assert.strictEqual(topic, 'test.tilechat.logs.' + REQUEST_ID,
      'each request gets its own routing key under the configured base');
  });

  it('debug and native are silent unless the request is a draft run', function () {
    const production = new Logger({ request_id: REQUEST_ID });
    production.debug("detail");
    production.native("step");
    assert.deepStrictEqual(published, [], 'a published bot must not stream designer logs');

    const draft = new Logger({ request_id: REQUEST_ID, dev: true });
    draft.debug("detail");
    draft.native("step");

    assert.deepStrictEqual(published.map((p) => p.data.level), ['debug', 'native']);
    assert.deepStrictEqual(published.map((p) => p.data.nlevel), [3, 4]);
    assert.deepStrictEqual(published.map((p) => p.data.dev), [true, true]);
  });

  it('dev is only honoured when it is exactly true', function () {
    const logger = new Logger({ request_id: REQUEST_ID, dev: "true" });
    logger.native("step");
    assert.deepStrictEqual(published, [], 'the string "true" is not a draft run');
    logger.info("still works");
    assert.strictEqual(published[0].data.dev, false);
  });

  it('several arguments are joined, and objects are pretty printed', function () {
    const logger = new Logger({ request_id: REQUEST_ID });
    logger.info("resbody:", { a: 1 }, 7);

    assert.strictEqual(published[0].data.text, 'resbody: ' + JSON.stringify({ a: 1 }, null, 2) + ' 7');
  });

  it('an automation request id publishes the webhook it came from', function () {
    const logger = new Logger({ request_id: "automation-request-P1-abcd-WEBHOOK1" });
    logger.info("hello");

    assert.strictEqual(published[0].data.webhook_id, "WEBHOOK1");
    assert.strictEqual(published[0].data.id_project, "P1");
  });

  it('an automation request id with no webhook segment publishes without one', function () {
    const logger = new Logger({ request_id: "automation-request-P1-abcd" });
    logger.info("hello");

    assert.strictEqual('webhook_id' in published[0].data, false);
  });

  it('a request id emptied after construction stops publishing rather than throwing', function () {
    const was = console.log;
    console.log = () => { };
    try {
      const logger = new Logger({ request_id: REQUEST_ID });
      logger.request_id = null;
      logger.error("it broke");
      assert.deepStrictEqual(published, []);
    } finally {
      console.log = was;
    }
  });

  it('formatLog leaves a plain string alone and joins the rest with single spaces', function () {
    const logger = new Logger({ request_id: REQUEST_ID });
    assert.strictEqual(logger.formatLog(["one"]), "one");
    assert.strictEqual(logger.formatLog(["one", "two"]), "one two");
    assert.strictEqual(logger.formatLog([]), "");
  });

});
