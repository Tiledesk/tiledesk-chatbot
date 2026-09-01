const assert = require('assert');
const winston = require('../utils/winston');
const { DirReplyV2 } = require('../directives/conversation/DirReplyV2');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');

// REGRESSION TEST - DirReplyV2 flowAttributes error handler.
//
// go() copies the user flow attributes into message.attributes.flowAttributes
// one key at a time, inside a try/catch. The catch called `winston.errpr(...)`
// - a typo for `error` - so the handler meant to absorb a per-key failure
// raised "winston.errpr is not a function" instead, turning a recoverable
// error into a rejected go() and a dropped reply.
//
// This is a unit-style test on purpose: the guarded statement is a plain
// property assignment onto an object go() itself created two lines earlier, so
// no HTTP request can make it throw. The only way to reach the handler is to
// hand the directive a message whose `attributes` refuses to keep
// `flowAttributes`, which is what the Proxy below does. Everything else is the
// real directive running its real code path.
describe('DirReplyV2 flowAttributes error handling', () => {

  let original_allParametersStatic;
  let original_userFlowAttributes;
  let original_updateConversationTranscript;
  let original_winston_error;

  beforeEach(() => {
    original_allParametersStatic = TiledeskChatbot.allParametersStatic;
    original_userFlowAttributes = TiledeskChatbotUtil.userFlowAttributes;
    original_updateConversationTranscript = TiledeskChatbotUtil.updateConversationTranscript;
    original_winston_error = winston.error;
  });

  afterEach(() => {
    TiledeskChatbot.allParametersStatic = original_allParametersStatic;
    TiledeskChatbotUtil.userFlowAttributes = original_userFlowAttributes;
    TiledeskChatbotUtil.updateConversationTranscript = original_updateConversationTranscript;
    winston.error = original_winston_error;
  });

  function buildDirective() {
    // A message whose `attributes` silently drops the `flowAttributes` slot:
    // the assignment reports success, so the very next statement dereferences
    // `undefined` and throws INSIDE the try block under test.
    const attributes_target = {
      commands: [
        { type: 'wait', time: 0 },
        { type: 'message', message: { type: 'text', text: 'hello' } }
      ]
    };
    const attributes = new Proxy(attributes_target, {
      set(target, prop, value) {
        if (prop === 'flowAttributes') {
          return true;
        }
        target[prop] = value;
        return true;
      }
    });

    const action = { text: 'hello', attributes: attributes };

    const context = {
      chatbot: { bot: { name: 'Your bot' } },
      reply: {},
      message: { text: 'hi' },
      tdcache: {},
      requestId: 'support-group-projectID-replyv2error',
      projectId: 'projectID',
      token: 'XXX',
      API_ENDPOINT: 'http://localhost:10002'
    };

    const dir = new DirReplyV2(context);
    // The reply is not the subject here: keep it off the network.
    dir.tdClient.sendSupportMessage = (requestId, message, callback) => { callback(null); };
    return { dir, action };
  }

  it('logs the per-key failure through winston instead of dying on it', async () => {
    TiledeskChatbot.allParametersStatic = async () => ({});
    TiledeskChatbotUtil.updateConversationTranscript = async () => { };
    TiledeskChatbotUtil.userFlowAttributes = () => ({ my_flow_var: 'a value' });

    const logged = [];
    winston.error = (...args) => { logged.push(args.map((a) => String(a)).join(' ')); };

    const { dir, action } = buildDirective();

    // Before the fix this rejects with "winston.errpr is not a function".
    const stop = await new Promise((resolve, reject) => {
      dir.go(action, (must_stop) => { resolve(must_stop); }).catch(reject);
    });

    assert.strictEqual(stop, false);
    assert.strictEqual(logged.length, 1, 'expected exactly one winston.error call, got: ' + JSON.stringify(logged));
    assert.ok(
      logged[0].indexOf('(DirReplyV2)') === 0,
      'expected the DirReplyV2 prefix, got: ' + logged[0]
    );
    assert.ok(
      logged[0].indexOf('my_flow_var') > -1 || logged[0].indexOf('a value') > -1,
      'expected the offending flow attribute to be named in the log, got: ' + logged[0]
    );
  });

});
