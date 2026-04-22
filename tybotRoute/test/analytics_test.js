'use strict';

const assert = require('assert');

// ---------------------------------------------------------------------------
// Intercept axios.post BEFORE requiring AnalyticsClient.
// Node's module cache ensures AnalyticsClient sees the same axios object.
// ---------------------------------------------------------------------------
const axiosModule = require('axios');
let _calls = [];
let _shouldReject = false;
const _origPost = axiosModule.post;

before(() => {
  axiosModule.post = (...args) => {
    _calls.push(args);
    if (_shouldReject) return Promise.reject(new Error('network error'));
    return Promise.resolve({ status: 200 });
  };
});

after(() => {
  axiosModule.post = _origPost;
});

function resetCalls() { _calls = []; }

// Now load AnalyticsClient — it will use the stubbed axios.post
const { AnalyticsClient } = require('../AnalyticsClient');

// ---------------------------------------------------------------------------
// Helpers to control env vars within tests
// ---------------------------------------------------------------------------
function withIngestUrl(fn) {
  const orig = process.env.ANALYTICS_INGEST_URL;
  process.env.ANALYTICS_INGEST_URL = 'http://analytics-ingest:3001';
  try { return fn(); } finally {
    if (orig !== undefined) process.env.ANALYTICS_INGEST_URL = orig;
    else delete process.env.ANALYTICS_INGEST_URL;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AnalyticsClient', function () {

  beforeEach(() => { resetCalls(); _shouldReject = false; });

  // ── no-op ─────────────────────────────────────────────────────────────────
  describe('no-op when ANALYTICS_INGEST_URL is unset', function () {
    it('does not call axios.post', function () {
      const orig = process.env.ANALYTICS_INGEST_URL;
      delete process.env.ANALYTICS_INGEST_URL;

      AnalyticsClient.track('chatbot.intent_matched', 'proj1', {
        bot_id: 'bot1', intent_name: 'start', match_type: 'explicit',
        confidence: null, step_count: 0, request_id: 'req1'
      });

      assert.strictEqual(_calls.length, 0);

      if (orig !== undefined) process.env.ANALYTICS_INGEST_URL = orig;
    });
  });

  // ── envelope shape ────────────────────────────────────────────────────────
  describe('HTTP POST envelope', function () {
    it('posts to ANALYTICS_INGEST_URL/events with correct envelope', function () {
      withIngestUrl(() => {
        AnalyticsClient.track('chatbot.intent_matched', 'proj1', {
          bot_id: 'bot1', intent_name: 'start', match_type: 'nlp',
          confidence: 0.95, step_count: 3, request_id: 'req1'
        });
      });

      assert.strictEqual(_calls.length, 1);
      const [url, body, opts] = _calls[0];
      assert.ok(url.endsWith('/events'), 'URL must end with /events');
      assert.strictEqual(body.event_type, 'chatbot.intent_matched');
      assert.strictEqual(body.id_project, 'proj1');
      assert.strictEqual(body.source_service, 'bot-engine');
      assert.ok(body.event_id, 'event_id must be present');
      assert.ok(body.timestamp, 'timestamp must be present');
      assert.deepStrictEqual(body.payload, {
        bot_id: 'bot1', intent_name: 'start', match_type: 'nlp',
        confidence: 0.95, step_count: 3, request_id: 'req1'
      });
    });

    it('includes X-Api-Key header when ANALYTICS_INGEST_API_KEY is set', function () {
      const origKey = process.env.ANALYTICS_INGEST_API_KEY;
      process.env.ANALYTICS_INGEST_API_KEY = 'secret-key';

      withIngestUrl(() => {
        AnalyticsClient.track('chatbot.flow_error', 'proj2', {
          bot_id: 'bot1', error_type: 'max_steps_exceeded',
          error_message: 'MAX ACTIONS exceeded', step_count: 1001,
          intent_name: 'loop', request_id: 'req2'
        });
      });

      assert.strictEqual(_calls.length, 1);
      const [, , opts] = _calls[0];
      assert.strictEqual(opts.headers['X-Api-Key'], 'secret-key');

      if (origKey !== undefined) process.env.ANALYTICS_INGEST_API_KEY = origKey;
      else delete process.env.ANALYTICS_INGEST_API_KEY;
    });

    it('omits X-Api-Key when ANALYTICS_INGEST_API_KEY is unset', function () {
      delete process.env.ANALYTICS_INGEST_API_KEY;

      withIngestUrl(() => {
        AnalyticsClient.track('chatbot.intent_matched', 'proj1', {
          bot_id: 'b', intent_name: 'i', match_type: 'exact',
          confidence: null, step_count: 0, request_id: null
        });
      });

      assert.strictEqual(_calls.length, 1);
      const [, , opts] = _calls[0];
      assert.ok(!opts.headers['X-Api-Key'], 'X-Api-Key should not be present');
    });
  });

  // ── fire-and-forget ───────────────────────────────────────────────────────
  describe('fire-and-forget error handling', function () {
    it('swallows axios rejections and never throws', function (done) {
      _shouldReject = true;

      withIngestUrl(() => {
        assert.doesNotThrow(() => {
          AnalyticsClient.track('chatbot.intent_matched', 'proj1', {
            bot_id: 'b', intent_name: 'i', match_type: 'exact',
            confidence: null, step_count: 0, request_id: null
          });
        });
      });

      // Confirm no unhandled rejection after the microtask queue drains
      setTimeout(() => done(), 50);
    });
  });

  // ── chatbot.intent_matched ────────────────────────────────────────────────
  describe('chatbot.intent_matched', function () {
    const matchTypes = ['exact', 'explicit', 'fallback', 'locked', 'nlp'];
    matchTypes.forEach((match_type) => {
      it(`accepts match_type="${match_type}"`, function () {
        withIngestUrl(() => {
          AnalyticsClient.track('chatbot.intent_matched', 'proj1', {
            bot_id: 'bot1', intent_name: 'greet',
            match_type, confidence: null, step_count: 0, request_id: 'r1'
          });
        });
        assert.strictEqual(_calls.length, 1);
        const [, body] = _calls[0];
        assert.strictEqual(body.payload.match_type, match_type);
        resetCalls();
      });
    });
  });

  // ── chatbot.bot_switched ──────────────────────────────────────────────────
  describe('chatbot.bot_switched', function () {
    it('posts correct payload', function () {
      withIngestUrl(() => {
        AnalyticsClient.track('chatbot.bot_switched', 'proj1', {
          from_bot_id: 'botA', to_bot_id: 'botB',
          intent_name: 'handover_intent', request_id: 'req3'
        });
      });
      assert.strictEqual(_calls.length, 1);
      const [, body] = _calls[0];
      assert.strictEqual(body.event_type, 'chatbot.bot_switched');
      assert.strictEqual(body.payload.from_bot_id, 'botA');
      assert.strictEqual(body.payload.to_bot_id, 'botB');
      assert.strictEqual(body.payload.intent_name, 'handover_intent');
    });
  });

  // ── handover_to_agent ─────────────────────────────────────────────────────
  describe('handover_to_agent', function () {
    it('posts correct payload with bot_id and trigger_intent', function () {
      withIngestUrl(() => {
        AnalyticsClient.track('handover_to_agent', 'proj1', {
          id_request: 'req4', agent_id: null, reason: 'bot_directive',
          department_id: 'dept1', waiting_time_seconds: null,
          bot_id: 'bot1', trigger_intent: 'talk_to_agent'
        });
      });
      assert.strictEqual(_calls.length, 1);
      const [, body] = _calls[0];
      assert.strictEqual(body.event_type, 'handover_to_agent');
      assert.strictEqual(body.payload.id_request, 'req4');
      assert.strictEqual(body.payload.bot_id, 'bot1');
      assert.strictEqual(body.payload.trigger_intent, 'talk_to_agent');
      assert.strictEqual(body.payload.reason, 'bot_directive');
    });
  });

  // ── chatbot.flow_error ────────────────────────────────────────────────────
  describe('chatbot.flow_error', function () {
    it('posts max_steps_exceeded error', function () {
      withIngestUrl(() => {
        AnalyticsClient.track('chatbot.flow_error', 'proj1', {
          bot_id: 'bot1', error_type: 'max_steps_exceeded',
          error_message: 'MAX ACTIONS (1000) exceeded', step_count: 1001,
          intent_name: 'looping_intent', request_id: 'req5'
        });
      });
      assert.strictEqual(_calls.length, 1);
      const [, body] = _calls[0];
      assert.strictEqual(body.event_type, 'chatbot.flow_error');
      assert.strictEqual(body.payload.error_type, 'max_steps_exceeded');
      assert.strictEqual(body.payload.step_count, 1001);
    });

    it('posts max_time_exceeded error', function () {
      withIngestUrl(() => {
        AnalyticsClient.track('chatbot.flow_error', 'proj1', {
          bot_id: 'bot1', error_type: 'max_time_exceeded',
          error_message: 'MAX EXECUTION TIME exceeded', step_count: 42,
          intent_name: null, request_id: 'req6'
        });
      });
      assert.strictEqual(_calls.length, 1);
      const [, body] = _calls[0];
      assert.strictEqual(body.payload.error_type, 'max_time_exceeded');
      assert.strictEqual(body.payload.step_count, 42);
      assert.strictEqual(body.payload.intent_name, null);
    });
  });

});
