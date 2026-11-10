var assert = require('assert');
const { DirCaptureUserReply } = require('../tiledeskChatbotPlugs/directives/DirCaptureUserReply');

describe('DirCaptureUserReply without lock key', () => {
  it('stops the block and does not lock', (done) => {
    const lockCalls = [];
    const fail = async (...a) => { lockCalls.push(a); };
    const chatbot = {
      currentLockedAction: async () => null,
      lockIntent: fail,
      lockAction: fail
    };
    const dir = new DirCaptureUserReply({
      reply: {}, message: { text: "x" }, chatbot, requestId: "req1", context: {}
    });
    let calls = [];
    dir.go({ _tdActionId: "a1" }, (stop) => {
      calls.push(stop);
      setTimeout(() => {
        try {
          assert.deepStrictEqual(calls, [true]);
          assert.deepStrictEqual(lockCalls, []);
          done();
        } catch (e) { done(e); }
      }, 50);
    });
  });
});
