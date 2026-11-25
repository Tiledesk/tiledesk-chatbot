'use strict';
const assert = require('assert');
const { detectTrigger } = require('../executions/trigger');
const RID = 'support-group-p-1';

describe('executions trigger: email', function () {
  it('a conversation opened by the email webhook', function () {
    assert.deepStrictEqual(
      detectTrigger({ request: { channel: { name: 'email' }, attributes: { start_type: 'email', email_webhook_id: 'e1' } }, attributes: { action: '#b1' } }, RID, 'b'),
      { type: 'email', source_id: 'e1', start_point_id: 'b1' });
  });
  it('start_type email counts without a channel', function () {
    assert.deepStrictEqual(detectTrigger({ request: { attributes: { start_type: 'email', email_webhook_id: 'e1' } } }, RID, 'b'),
      { type: 'email', source_id: 'e1', start_point_id: null });
  });
  it('a department email has no source', function () {
    assert.deepStrictEqual(detectTrigger({ request: { channel: { name: 'email' } } }, RID, 'b'),
      { type: 'email', source_id: null, start_point_id: null });
  });
  it('a department email that starts at the email block keeps the block', function () {
    assert.deepStrictEqual(detectTrigger({ request: { channel: { name: 'email' } }, attributes: { action: '#b1' } }, RID, 'b'),
      { type: 'email', source_id: null, start_point_id: 'b1' });
  });
  it('other channels and other start types are unchanged', function () {
    assert.deepStrictEqual(detectTrigger({ request: { channel: { name: 'form' } } }, RID, 'b'),
      { type: 'channel', source_id: 'form', start_point_id: null });
    assert.strictEqual(detectTrigger({ request: { channel: { name: 'email' } } }, 'automation-request-p-1', 'b').type, 'automation');
    assert.deepStrictEqual(detectTrigger({ request: { channel: { name: 'email' }, attributes: { start_type: 'webhook', webhook_id: 'w1' } } }, RID, 'b'),
      { type: 'webhook', source_id: 'w1', start_point_id: null });
    assert.deepStrictEqual(detectTrigger({ request: { channel: { name: 'email' }, attributes: { start_type: 'scheduled', chatbot_id: 'c1' } } }, RID, 'b'),
      { type: 'scheduled', source_id: 'c1', start_point_id: null });
    assert.deepStrictEqual(detectTrigger({ request: { channel: { name: 'email' }, attributes: { start_type: 'trigger' } } }, RID, 'b'),
      { type: 'trigger', source_id: null, start_point_id: null });
  });
  it('start_type email without an email webhook id has no source', function () {
    assert.deepStrictEqual(detectTrigger({ request: { attributes: { start_type: 'email' } } }, RID, 'b'),
      { type: 'email', source_id: null, start_point_id: null });
  });
});
