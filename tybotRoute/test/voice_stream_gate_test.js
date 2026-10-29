var assert = require('assert');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot');

function message(channelName, attributes, requestAttributes) {
  return { _id: 'm1', attributes, request: { request_id: 'r1', channel: { name: channelName }, attributes: requestAttributes } };
}

describe('Voice stream gate (TiledeskChatbot.isVoiceStreamMessage)', function () {
  let saved;
  before(() => {
    saved = { enabled: process.env.STREAM_ENABLED, channels: process.env.STREAM_CHANNELS };
    process.env.STREAM_ENABLED = 'true';
    delete process.env.STREAM_CHANNELS;
  });
  after(() => {
    if (saved.enabled === undefined) delete process.env.STREAM_ENABLED; else process.env.STREAM_ENABLED = saved.enabled;
    if (saved.channels !== undefined) process.env.STREAM_CHANNELS = saved.channels;
  });

  it('streams a voice_twilio request marked voice_stream (request attribute set on /start)', () => {
    assert.strictEqual(TiledeskChatbot.isVoiceStreamMessage(message('voice_twilio', {}, { voice_stream: true })), true);
    assert.strictEqual(TiledeskChatbot.isVoiceStreamMessage(message('voice_twilio', undefined, { voice_stream: true })), true);
  });

  it('accepts the previous per-message marker voice_relay', () => {
    assert.strictEqual(TiledeskChatbot.isVoiceStreamMessage(message('voice_twilio', { voice_relay: true }, {})), true);
  });

  it('does not stream a Gather call (no marker), other channels, or with streaming disabled', () => {
    assert.strictEqual(TiledeskChatbot.isVoiceStreamMessage(message('voice_twilio', {}, {})), false);
    assert.strictEqual(TiledeskChatbot.isVoiceStreamMessage(message('voice_twilio', undefined, undefined)), false);
    assert.strictEqual(TiledeskChatbot.isVoiceStreamMessage(message('voice_twilio', {}, { voice_stream: 'true' })), false);
    assert.strictEqual(TiledeskChatbot.isVoiceStreamMessage(message('chat21', {}, { voice_stream: true })), false);
    assert.strictEqual(TiledeskChatbot.isVoiceStreamMessage({ _id: 'm1' }), false);
    process.env.STREAM_ENABLED = 'false';
    assert.strictEqual(TiledeskChatbot.isVoiceStreamMessage(message('voice_twilio', {}, { voice_stream: true })), false);
    process.env.STREAM_ENABLED = 'true';
  });
});
