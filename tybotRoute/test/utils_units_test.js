'use strict';

// tybotRoute/utils, exercised directly.
//
// These eleven modules are the shared plumbing every directive and every route
// leans on: the reply "commands" manipulation, the request-attribute
// projection, the transcript, the two http helpers. Their happy paths get run
// incidentally by the conversation-* files; the branches that decide what
// happens when the input is malformed - a null string, an odd command list, a
// message with no attributes, an endpoint that answers 500 or never answers -
// were unrun, and that is where the three defects recorded in the it.skip()
// blocks below live.
//
// AI_MODELS is read by utils/aiUtils at REQUIRE time into a module-level
// const, so it has to be set before the requires. Scoped to this file: it is a
// deployment setting, not a suite-wide one.
process.env.AI_MODELS = 'gpt-4o : 25 ; gpt-3.5-turbo:0.6 ; free-model';

var assert = require('assert');
var express = require('express');
const bodyParser = require('body-parser');

const { ChatbotIntentUtil } = require('../utils/ChatbotIntentUtil');
const { ChatbotMessageUtil } = require('../utils/ChatbotMessageUtil');
const { ChatbotReplyUtil } = require('../utils/ChatbotReplyUtil');
const { ChatbotTranscriptUtil } = require('../utils/ChatbotTranscriptUtil');
const { ChatbotJSONContentUtil } = require('../utils/ChatbotJSONContentUtil');
const { ChatbotRequestAttributesUtil } = require('../utils/ChatbotRequestAttributesUtil');
const { ChatbotParametersClient } = require('../utils/ChatbotParametersClient');
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const { TiledeskChatbotConst } = require('../engine/TiledeskChatbotConst');
const { MODELS_MULTIPLIER } = require('../utils/aiUtils');
const httpUtils = require('../utils/HttpUtils');
const http = require('../utils/http');

const MOCK_PORT = 10002;
const TILEBOT_PORT = 10001;
const MOCK = 'http://localhost:' + MOCK_PORT;

// ------------------------------------------------------------------ fakes

/** A chatbot that records every parameter write, for updateRequestAttributes. */
function fakeChatbot(bot, existing) {
  const params = Object.assign({}, existing);
  const deleted = [];
  return {
    params, deleted,
    bot: bot === undefined ? { name: "Test Bot", _id: "BOT-1" } : bot,
    async getParameter(k) { return params[k]; },
    async addParameter(k, v) { params[k] = v; },
    async deleteParameter(k) { deleted.push(k); delete params[k]; }
  };
}

/** message.attributes.commands: a wait/message pair per text. */
function commandsFor(texts) {
  const commands = [];
  for (const t of texts) {
    commands.push({ type: "wait", time: 500 });
    commands.push({ type: "message", message: { type: "text", text: t } });
  }
  return { attributes: { commands } };
}

function startMock(routes) {
  return new Promise((resolve) => {
    const seen = [];
    const server = express();
    server.use(bodyParser.json());
    server.all('*', (req, res) => {
      seen.push({ method: req.method, url: req.originalUrl, headers: req.headers, body: req.body });
      routes(req, res);
    });
    const listener = server.listen(MOCK_PORT, '0.0.0.0', () => {
      resolve({ seen, close: () => new Promise((r) => listener.close(() => r())) });
    });
  });
}

// ==================================================================== tests

describe('utils, the error and edge paths', function () {

  // ---------------------------------------------------------------- aiUtils

  describe('aiUtils', function () {

    it('AI_MODELS is parsed into a name -> multiplier map, whitespace and all', function () {
      assert.strictEqual(MODELS_MULTIPLIER['gpt-4o'], 25);
      assert.strictEqual(MODELS_MULTIPLIER['gpt-3.5-turbo'], 0.6);
    });

    it('a model listed with no multiplier maps to null rather than NaN', function () {
      assert.strictEqual(MODELS_MULTIPLIER['free-model'], null,
        'a bare name must not become NaN, which would silently zero every quota sum');
    });

    it('the map holds exactly the models AI_MODELS listed', function () {
      assert.deepStrictEqual(Object.keys(MODELS_MULTIPLIER).sort(),
        ['free-model', 'gpt-3.5-turbo', 'gpt-4o']);
    });

  });

  // ------------------------------------------------------- ChatbotIntentUtil

  describe('ChatbotIntentUtil', function () {

    it('a null intent name is refused', function () {
      assert.strictEqual(ChatbotIntentUtil.parseIntent(null), null);
    });

    it('an intent name that is only whitespace is refused', function () {
      assert.strictEqual(ChatbotIntentUtil.parseIntent("   "), null);
      assert.strictEqual(ChatbotIntentUtil.parseIntent(""), null);
    });

    it('a name that is nothing but a json block parses to an EMPTY name', function () {
      // The `parts[0].startsWith("{")` guard three lines above cannot fire:
      // parts comes from split("{"), so parts[0] never contains a "{". What
      // actually happens is recorded here rather than assumed.
      assert.deepStrictEqual(ChatbotIntentUtil.parseIntent("{'a':1}"),
        { name: "", parameters: { a: 1 } });
    });

    it('a bare name parses to that name and no parameters', function () {
      assert.deepStrictEqual(ChatbotIntentUtil.parseIntent("welcome"), { name: "welcome" });
    });

    it("single quotes in the parameter block are accepted as json", function () {
      assert.deepStrictEqual(ChatbotIntentUtil.parseIntent("order{'id':7,'name':'ada'}"),
        { name: "order", parameters: { id: 7, name: "ada" } });
    });

    it('actionsToDirectives names each directive after its action type and keeps the action', function () {
      const actions = [{ _tdActionType: "reply", text: "hi" }, { _tdActionType: "intent", intentName: "OK" }];
      const directives = ChatbotIntentUtil.actionsToDirectives(actions);

      assert.deepStrictEqual(directives.map((d) => d.name), ["reply", "intent"]);
      assert.strictEqual(directives[0].action, actions[0], 'the action travels with the directive, not a copy');
    });

    it('actionsToDirectives on nothing at all gives an empty list', function () {
      assert.deepStrictEqual(ChatbotIntentUtil.actionsToDirectives(undefined), []);
      assert.deepStrictEqual(ChatbotIntentUtil.actionsToDirectives([]), []);
    });

    it('AiConditionPromptBuilder lists one label/condition line per intent', function () {
      const prompt = ChatbotIntentUtil.AiConditionPromptBuilder(
        "HEADER",
        [{ label: "refund", prompt: "the user wants money back" },
         { label: "hello", prompt: "the user is greeting" }],
        "answer with one word");

      assert.ok(prompt.startsWith("HEADER"), prompt);
      assert.ok(prompt.includes("- label: refund When: the user wants money back\n"), prompt);
      assert.ok(prompt.includes("- label: hello When: the user is greeting\n"), prompt);
      assert.ok(prompt.trim().endsWith("answer with one word"), prompt);
    });

    // DEFECT - utils/ChatbotIntentUtil.js:50
    //
    //   catch (err) {
    //     winston.error("(TiledeskChatbotUtils) Error on parse json_string ", err)
    //   }
    //
    // ChatbotIntentUtil.js requires exactly one module - directives/Directives -
    // and never requires ./winston. `winston` is therefore not defined in this
    // scope, so the handler that exists to survive a malformed parameter block
    // throws "ReferenceError: winston is not defined" instead. The throw
    // escapes parseIntent, which is called from the engine while resolving an
    // explicit intent name, so a bot author writing `myBlock{oops}` in a
    // connector crashes the reply rather than getting a logged warning.
    // (The file was split out of TiledeskChatbotUtil, which does require
    // winston; the require did not come with it.)
    //
    // Correct behaviour, asserted here: an unparseable parameter block is
    // logged and the intent still resolves by name, with no parameters.
    it('a malformed parameter block leaves the intent usable', function () {
      assert.deepStrictEqual(ChatbotIntentUtil.parseIntent("myBlock{not json}"),
        { name: "myBlock" });
    });

  });

  // ------------------------------------------------------ ChatbotMessageUtil

  describe('ChatbotMessageUtil', function () {

    it('stripEmoji passes null straight through', function () {
      assert.strictEqual(ChatbotMessageUtil.stripEmoji(null), null);
    });

    it('stripEmoji removes the emoji and collapses the whitespace it leaves', function () {
      assert.strictEqual(ChatbotMessageUtil.stripEmoji("hello  world"), "hello world");
    });

    it('a message flagged subtype "info" is hidden', function () {
      assert.strictEqual(ChatbotMessageUtil.isHiddenMessage({ attributes: { subtype: "info" } }), true);
      assert.strictEqual(ChatbotMessageUtil.isHiddenMessage({ attributes: { subtype: "other" } }), false);
      assert.strictEqual(ChatbotMessageUtil.isHiddenMessage({}), false);
      assert.strictEqual(ChatbotMessageUtil.isHiddenMessage(null), false);
    });

    it('an audio message is a file whose metadata type mentions audio', function () {
      const audio = { type: "file", metadata: { src: "http://x/a.ogg", type: "audio/ogg" } };
      assert.strictEqual(ChatbotMessageUtil.isAudioMessage(audio), true);
      assert.strictEqual(ChatbotMessageUtil.isAudioMessage(
        { type: "file", metadata: { src: "http://x/a.pdf", type: "application/pdf" } }), false);
      assert.strictEqual(ChatbotMessageUtil.isAudioMessage({ type: "text" }), false);
      assert.strictEqual(ChatbotMessageUtil.isAudioMessage(null), false);
    });

    it('lastUserMessageFrom keeps the twelve fields and renames _id to id', function () {
      const projection = ChatbotMessageUtil.lastUserMessageFrom({
        _id: "m-1", text: "hi", type: "text", sender: "u-1", recipient: "r-1",
        senderFullname: "Ada", channel_type: "group", status: 0, createdBy: "system",
        attributes: { a: 1 }, metadata: { b: 2 }, channel: { name: "chat21" },
        somethingElse: "must not survive"
      });

      assert.strictEqual(projection.id, "m-1");
      assert.strictEqual(projection._id, undefined);
      assert.strictEqual(projection.text, "hi");
      assert.deepStrictEqual(projection.channel, { name: "chat21" });
      assert.strictEqual('somethingElse' in projection, false);
    });

  });

  // -------------------------------------------------------- ChatbotReplyUtil

  describe('ChatbotReplyUtil', function () {

    it('chooseRandomReply returns the wait/message pair, whatever the draw', function () {
      const message = commandsFor(["one", "two", "three"]);
      const was = Math.random;
      try {
        for (const draw of [0, 0.4, 0.99]) {
          Math.random = () => draw;
          const picked = ChatbotReplyUtil.chooseRandomReply(message);
          assert.strictEqual(picked.length, 2);
          assert.strictEqual(picked[0].type, "wait", 'the wait must come first');
          assert.strictEqual(picked[1].type, "message",
            'an even draw must be bumped to the message index, never left on a wait');
        }
      } finally {
        Math.random = was;
      }
    });

    it('an odd number of commands is refused rather than paired wrongly', function () {
      const message = { attributes: { commands: [{ type: "wait", time: 1 }, { type: "message" }, { type: "wait", time: 1 }] } };
      assert.strictEqual(ChatbotReplyUtil.chooseRandomReply(message), null);
    });

    it('a message with no commands at all has no random reply', function () {
      assert.strictEqual(ChatbotReplyUtil.chooseRandomReply({ attributes: {} }), null);
      assert.strictEqual(ChatbotReplyUtil.chooseRandomReply({}), null);
      assert.strictEqual(ChatbotReplyUtil.chooseRandomReply(null), null);
    });

    it('filterOnVariables with no variables leaves the commands untouched', function () {
      const message = commandsFor(["one", "two"]);
      const before = JSON.parse(JSON.stringify(message.attributes.commands));
      assert.strictEqual(ChatbotReplyUtil.filterOnVariables(message, null), undefined);
      assert.deepStrictEqual(message.attributes.commands, before);
      assert.strictEqual(message.text, undefined, 'the text is not rebuilt when there is nothing to filter');
    });

    it('a command whose condition is false is dropped together with its wait', function () {
      const message = commandsFor(["kept", "dropped"]);
      message.attributes.commands[3].message._tdJSONCondition = {
        type: "expression",
        conditions: [{
          type: "condition", operand1: "plan", operator: "equalAsStrings",
          operand2: { type: "const", value: "premium", name: "" }
        }]
      };
      ChatbotReplyUtil.filterOnVariables(message, { plan: "basic" });

      const texts = message.attributes.commands.filter((c) => c.type === "message").map((c) => c.message.text);
      assert.deepStrictEqual(texts, ["kept"], 'the false-condition message must go');
      assert.strictEqual(message.attributes.commands.length, 2, 'and its wait with it');
      assert.strictEqual(message.text, "kept");
    });

    it('a command whose condition is true is kept and joins the rebuilt text', function () {
      const message = commandsFor(["first", "second"]);
      message.attributes.commands[3].message._tdJSONCondition = {
        type: "expression",
        conditions: [{
          type: "condition", operand1: "plan", operator: "equalAsStrings",
          operand2: { type: "const", value: "premium", name: "" }
        }]
      };
      ChatbotReplyUtil.filterOnVariables(message, { plan: "premium" });

      assert.strictEqual(message.attributes.commands.length, 4, 'nothing is dropped');
      assert.strictEqual(message.text, "first\n\nsecond");
    });

    it('removeEmptyReplyCommands drops a blank text command and the wait before it', function () {
      const message = commandsFor(["kept", "   ", "also kept"]);
      const returned = ChatbotReplyUtil.removeEmptyReplyCommands(message);

      const texts = returned.attributes.commands.filter((c) => c.type === "message").map((c) => c.message.text);
      assert.deepStrictEqual(texts, ["kept", "also kept"]);
      assert.strictEqual(returned.attributes.commands.length, 4);
    });

    it('removeEmptyReplyCommands drops a text command with no text at all', function () {
      const message = { attributes: { commands: [{ type: "wait", time: 500 }, { type: "message", message: { type: "text" } }] } };
      ChatbotReplyUtil.removeEmptyReplyCommands(message);
      assert.deepStrictEqual(message.attributes.commands, []);
    });

    it('removeEmptyReplyCommands leaves image commands and waits alone', function () {
      const message = { attributes: { commands: [
        { type: "wait", time: 500 },
        { type: "message", message: { type: "image", metadata: { src: "http://x/i.png" } } }
      ] } };
      ChatbotReplyUtil.removeEmptyReplyCommands(message);
      assert.strictEqual(message.attributes.commands.length, 2, 'a non-text command has no text to be empty');
    });

    it('removeEmptyReplyCommands hands back a message it cannot read, unchanged', function () {
      assert.strictEqual(ChatbotReplyUtil.removeEmptyReplyCommands(null), null);
      const empty = { attributes: { commands: [] } };
      assert.strictEqual(ChatbotReplyUtil.removeEmptyReplyCommands(empty), empty);
    });

    it('isValidReply is true only for a message carrying at least one command', function () {
      assert.strictEqual(ChatbotReplyUtil.isValidReply(commandsFor(["hi"])), true);
      assert.strictEqual(ChatbotReplyUtil.isValidReply({ attributes: { commands: [] } }), false);
      assert.strictEqual(ChatbotReplyUtil.isValidReply({ attributes: {} }), false);
      assert.strictEqual(ChatbotReplyUtil.isValidReply(null), false);
    });

    it('totalMessageWait sums every wait and returns undefined when there is nothing to sum', function () {
      assert.strictEqual(ChatbotReplyUtil.totalMessageWait(commandsFor(["a", "b"])), 1000);
      assert.strictEqual(ChatbotReplyUtil.totalMessageWait({ attributes: { commands: [] } }), undefined);
      assert.strictEqual(ChatbotReplyUtil.totalMessageWait({ attributes: {} }), undefined,
        'a reply whose action carried no attributes must not throw here');
      assert.strictEqual(ChatbotReplyUtil.totalMessageWait(null), undefined);
    });

    it('fillCommandAttachments fills both the link and the value of every button', function () {
      const command = { message: { attributes: { attachment: { buttons: [
        { value: "Call {{who}}", link: "https://x.test/{{who}}" },
        { value: "No link here" }
      ] } } } };
      ChatbotReplyUtil.fillCommandAttachments(command, { who: "ada" });

      assert.strictEqual(command.message.attributes.attachment.buttons[0].value, "Call ada");
      assert.strictEqual(command.message.attributes.attachment.buttons[0].link, "https://x.test/ada");
      assert.strictEqual(command.message.attributes.attachment.buttons[1].value, "No link here");
    });

    it('fillCommandAttachments on a command with no attachment changes nothing', function () {
      const command = { message: { text: "plain" } };
      ChatbotReplyUtil.fillCommandAttachments(command, { who: "ada" });
      assert.deepStrictEqual(command, { message: { text: "plain" } });
    });

    it('allReplyButtons collects the action buttons of every command and nothing else', function () {
      const message = { attributes: { commands: [
        { type: "wait", time: 1 },
        { type: "message", message: { attributes: { attachment: { buttons: [
          { type: "action", value: "Go" }, { type: "url", value: "Docs" }
        ] } } } },
        { type: "message", message: { text: "no attachment" } },
        { type: "message", message: { attributes: { attachment: { buttons: [{ type: "action", value: "Back" }] } } } }
      ] } };

      assert.deepStrictEqual(ChatbotReplyUtil.allReplyButtons(message).map((b) => b.value), ["Go", "Back"]);
      assert.deepStrictEqual(ChatbotReplyUtil.allReplyButtons({ attributes: { commands: [] } }), []);
      assert.deepStrictEqual(ChatbotReplyUtil.allReplyButtons({ attributes: {} }), []);
    });

    it('buttonByText matches on the value, case and padding insensitively', function () {
      const buttons = [{ value: "Yes please" }, { value: "No thanks" }];
      assert.strictEqual(ChatbotReplyUtil.buttonByText("  YES PLEASE ", buttons).value, "Yes please");
      assert.strictEqual(ChatbotReplyUtil.buttonByText("maybe", buttons), null);
    });

    it('buttonByText falls back to the comma separated alias list', function () {
      const buttons = [{ value: "Yes please", alias: "y, yep , sure" }];
      assert.strictEqual(ChatbotReplyUtil.buttonByText("YEP", buttons).value, "Yes please");
      assert.strictEqual(ChatbotReplyUtil.buttonByText("nope", buttons), null);
    });

    it('buttonByText with a null text or a null button list matches nothing', function () {
      assert.strictEqual(ChatbotReplyUtil.buttonByText(null, [{ value: "Yes" }]), null);
      assert.strictEqual(ChatbotReplyUtil.buttonByText("yes", null), null);
    });

    it('addConnectAction appends the next block action, and only when there is a list to append to', function () {
      const reply = { attributes: { nextBlockAction: { _tdActionType: "intent" } }, actions: [{ _tdActionType: "reply" }] };
      ChatbotReplyUtil.addConnectAction(reply);
      assert.strictEqual(reply.actions.length, 2);
      assert.deepStrictEqual(reply.actions[1], { _tdActionType: "intent" });

      const noActions = { attributes: { nextBlockAction: { _tdActionType: "intent" } } };
      ChatbotReplyUtil.addConnectAction(noActions);
      assert.strictEqual(noActions.actions, undefined);

      ChatbotReplyUtil.addConnectAction(null); // must not throw
    });

  });

  // ---------------------------------------------------- ChatbotTranscriptUtil

  describe('ChatbotTranscriptUtil', function () {

    it('a message with no sender name is not a conversation turn', async function () {
      const chatbot = fakeChatbot();
      assert.strictEqual(await ChatbotTranscriptUtil.updateConversationTranscript(chatbot, { text: "hi" }), null);
      assert.strictEqual(await ChatbotTranscriptUtil.updateConversationTranscript(chatbot, null), null);
      assert.deepStrictEqual(chatbot.params, {});
    });

    it('the bot is tagged bot: and everyone else user:', async function () {
      const chatbot = fakeChatbot({ name: "Test Bot" });
      await ChatbotTranscriptUtil.updateConversationTranscript(chatbot, { text: "hello", senderFullname: "Test Bot" });
      assert.strictEqual(chatbot.params.transcript, "<bot:Test Bot> hello");

      await ChatbotTranscriptUtil.updateConversationTranscript(chatbot, { text: "hi", senderFullname: "Ada" });
      assert.strictEqual(chatbot.params.transcript, "<bot:Test Bot> hello\n<user:Ada>hi");
    });

    it('an internal, empty or hidden message never reaches the transcript', async function () {
      const chatbot = fakeChatbot({ name: "Test Bot" });
      await ChatbotTranscriptUtil.updateConversationTranscript(chatbot, { text: "x", senderFullname: "Ada", sender: "_tdinternal" });
      await ChatbotTranscriptUtil.updateConversationTranscript(chatbot, { text: "   ", senderFullname: "Ada" });
      await ChatbotTranscriptUtil.updateConversationTranscript(chatbot, { text: "x", senderFullname: "Ada", attributes: { subtype: "info" } });
      assert.strictEqual(chatbot.params.transcript, undefined);
    });

    it('clearConversationTranscript empties it and calls back when asked to', async function () {
      const chatbot = fakeChatbot({ name: "Test Bot" }, { transcript: "<user:Ada> hi" });
      let called = 0;
      await ChatbotTranscriptUtil.clearConversationTranscript(chatbot, () => { called += 1; });
      assert.strictEqual(chatbot.params.transcript, "");
      assert.strictEqual(called, 1);

      await ChatbotTranscriptUtil.clearConversationTranscript(chatbot); // no callback: must not throw
      assert.strictEqual(chatbot.params.transcript, "");
    });

    it('transcriptJSON turns the tagged transcript back into chat completion messages', function () {
      const messages = ChatbotTranscriptUtil.transcriptJSON("<user:Ada> hi\n<bot:Test Bot> hello there");
      assert.deepStrictEqual(messages, [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello there" }
      ]);
    });

    it('transcriptJSON on text with no tags yields no messages', function () {
      assert.deepStrictEqual(ChatbotTranscriptUtil.transcriptJSON("just some text"), []);
      assert.deepStrictEqual(ChatbotTranscriptUtil.transcriptJSON(""), []);
    });

  });

  // ----------------------------------------------------- ChatbotJSONContentUtil

  describe('ChatbotJSONContentUtil', function () {

    it('renderJSONButtons fills every button from the flow attributes', function () {
      const buttons = ChatbotJSONContentUtil.renderJSONButtons(
        '[{"value":"Call {{who}}","type":"text"},{"value":"Docs","type":"url","link":"https://x.test/{{who}}"}]',
        { who: "ada" });

      assert.strictEqual(buttons.length, 2);
      assert.strictEqual(buttons[0].value, "Call ada");
      assert.strictEqual(buttons[1].link, "https://x.test/ada");
    });

    it('renderJSONButtons returns null for a string that is not json', function () {
      assert.strictEqual(ChatbotJSONContentUtil.renderJSONButtons('[{"value": }]', {}), null,
        'a designer typo must not throw out of the reply pipeline');
    });

    it('replaceJSONGalleries swaps json_gallery for a rendered gallery', function () {
      const message = { attributes: { commands: [{
        type: "message",
        message: { attributes: { attachment: { json_gallery:
          '[{"title":"Order {{order}}","buttons":[{"value":"Track {{order}}","type":"text"}]}]' } } }
      }] } };
      ChatbotJSONContentUtil.replaceJSONGalleries(message, { order: "A-9" });

      const attachment = message.attributes.commands[0].message.attributes.attachment;
      assert.strictEqual(attachment.json_gallery, undefined, 'the source string is consumed');
      assert.strictEqual(attachment.gallery.length, 1);
      assert.strictEqual(attachment.gallery[0].title, "Order A-9");
      assert.strictEqual(attachment.gallery[0].buttons[0].value, "Track A-9");
    });

    it('a json_gallery that is not an array is left in place rather than half applied', function () {
      const message = { attributes: { commands: [{
        type: "message",
        message: { attributes: { attachment: { json_gallery: '{"title":"not an array"}' } } }
      }] } };
      ChatbotJSONContentUtil.replaceJSONGalleries(message, {});

      const attachment = message.attributes.commands[0].message.attributes.attachment;
      assert.strictEqual(attachment.gallery, undefined);
      assert.strictEqual(attachment.json_gallery, '{"title":"not an array"}');
    });

    it('a json_gallery that will not parse leaves the command untouched', function () {
      const message = { attributes: { commands: [{
        type: "message",
        message: { attributes: { attachment: { json_gallery: '[{"title": }]' } } }
      }] } };
      const returned = ChatbotJSONContentUtil.replaceJSONGalleries(message, {});

      const attachment = returned.attributes.commands[0].message.attributes.attachment;
      assert.strictEqual(attachment.gallery, undefined);
      assert.strictEqual(attachment.json_gallery, '[{"title": }]');
    });

    it('a message with no commands passes through replaceJSONGalleries unchanged', function () {
      const message = { attributes: {} };
      assert.strictEqual(ChatbotJSONContentUtil.replaceJSONGalleries(message, {}), message);
    });

  });

  // ------------------------------------------- ChatbotRequestAttributesUtil

  describe('ChatbotRequestAttributesUtil.updateRequestAttributes', function () {

    const K = TiledeskChatbotConst;

    it('the project, request and chatbot identity are always written', async function () {
      const chatbot = fakeChatbot({ name: "Test Bot", _id: "BOT-1" });
      await ChatbotRequestAttributesUtil.updateRequestAttributes(
        chatbot, "TOKEN", { _id: "m-1" }, "P1", "support-group-P1-abcd");

      assert.strictEqual(chatbot.params[K.REQ_PROJECT_ID_KEY], "P1");
      assert.strictEqual(chatbot.params[K.REQ_REQUEST_ID_KEY], "support-group-P1-abcd");
      assert.strictEqual(chatbot.params[K.REQ_CHATBOT_NAME_KEY], "Test Bot");
      assert.strictEqual(chatbot.params[K.REQ_CHATBOT_ID_KEY], "BOT-1");
      assert.strictEqual(chatbot.params[K.REQ_CHATBOT_TOKEN], "TOKEN");
      assert.strictEqual(chatbot.params[K.REQ_CHATBOT_TOKEN_v2], "JWT TOKEN");
      assert.strictEqual(chatbot.params[K.REQ_LAST_MESSAGE_ID_KEY], "m-1");
    });

    it('a user text message writes both text keys, the type and the channel, and clears userInput', async function () {
      const chatbot = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {
        _id: "m-2", text: "hello", type: "text", sender: "u-1",
        channel: { name: "chat21" }, senderFullname: "Ada"
      }, "P1", "support-group-P1-abcd");

      assert.strictEqual(chatbot.params[K.REQ_LAST_USER_TEXT_KEY], "hello");
      assert.strictEqual(chatbot.params[K.REQ_LAST_USER_TEXT_v2_KEY], "hello");
      assert.strictEqual(chatbot.params[K.REQ_LAST_USER_MESSAGE_TYPE_KEY], "text");
      assert.strictEqual(chatbot.params[K.REQ_CHAT_CHANNEL], "web", 'chat21 is presented as "web"');
      assert.strictEqual(chatbot.params[K.REQ_LAST_USER_MESSAGE_KEY].text, "hello");
      assert.ok(chatbot.deleted.includes(K.USER_INPUT), 'the previous userInput must be deleted, not overwritten');
    });

    it('a non-chat21 channel keeps its own name', async function () {
      const chatbot = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {
        text: "hi", type: "text", channel: { name: "whatsapp" }
      }, "P1", "support-group-P1-abcd");
      assert.strictEqual(chatbot.params[K.REQ_CHAT_CHANNEL], "whatsapp");
    });

    it('an internal message writes no user text at all', async function () {
      const chatbot = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {
        text: "\\start", type: "text", sender: "_tdinternal"
      }, "P1", "support-group-P1-abcd");

      assert.strictEqual(chatbot.params[K.REQ_LAST_USER_TEXT_KEY], undefined);
      assert.deepStrictEqual(chatbot.deleted, []);
    });

    it('an image message writes the five image attributes', async function () {
      const chatbot = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {
        type: "image", metadata: { src: "http://x/i.png", name: "i.png", width: 10, height: 20, type: "image/png" }
      }, "P1", "support-group-P1-abcd");

      assert.strictEqual(chatbot.params[K.REQ_LAST_USER_IMAGE_URL], "http://x/i.png");
      assert.strictEqual(chatbot.params[K.REQ_LAST_USER_IMAGE_NAME], "i.png");
      assert.strictEqual(chatbot.params[K.REQ_LAST_USER_IMAGE_WIDTH], 10);
      assert.strictEqual(chatbot.params[K.REQ_LAST_USER_IMAGE_HEIGHT], 20);
      assert.strictEqual(chatbot.params[K.REQ_LAST_USER_IMAGE_TYPE], "image/png");
    });

    it('a file message writes the attachment url and derives the inline one', async function () {
      const chatbot = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {
        type: "file", metadata: { src: "http://x/files/download", name: "doc.pdf", type: "application/pdf" }
      }, "P1", "support-group-P1-abcd");

      assert.strictEqual(chatbot.params[K.REQ_LAST_USER_DOCUMENT_URL], "http://x/files/download");
      assert.strictEqual(chatbot.params[K.REQ_LAST_USER_DOCUMENT_NAME], "doc.pdf");
      assert.strictEqual(chatbot.params[K.REQ_LAST_USER_DOCUMENT_TYPE], "application/pdf");
    });

    // DEFECT - utils/ChatbotRequestAttributesUtil.js:84 and :87
    //
    //   add(TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_AS_ATTACHMENT_URL, m.src);
    //   const inlineUrl = m.src.replace("/download", "/");
    //   add(TiledeskChatbotConst.REQ_LAST_USER_DOCUMENT_AS_INLINE_URL, inlineUrl);
    //
    // Neither constant is declared on TiledeskChatbotConst - grep finds these
    // two reads and no `static REQ_LAST_USER_DOCUMENT_AS_...` anywhere - so
    // both evaluate to `undefined`. `add` guards on `k !== undefined`, which
    // means the two writes are silently skipped: the failure is invisible.
    // A bot author who uses {{lastUserDocumentAsAttachmentURL}} or the inline
    // variant in a reply gets nothing, with nothing logged to explain it, and
    // the inlineUrl computed on the line between them is dead work.
    //
    // Correct behaviour, asserted here: both attributes are written, the
    // inline one with "/download" stripped.
    //
    // A product decision is needed on the ATTRIBUTE NAMES before this can be
    // fixed - they are what a bot author types into a reply, so they are
    // public API. The names below are the obvious camelCase of the constant,
    // matching lastUserDocumentURL/Name/Type next to them, but nothing in the
    // code or the tests settles it.
    it.skip('a file message also writes the attachment and inline document urls', async function () {
      const chatbot = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {
        type: "file", metadata: { src: "http://x/files/download", name: "doc.pdf", type: "application/pdf" }
      }, "P1", "support-group-P1-abcd");

      assert.strictEqual(chatbot.params['lastUserDocumentAsAttachmentURL'], "http://x/files/download");
      assert.strictEqual(chatbot.params['lastUserDocumentAsInlineURL'], "http://x/files/");
    });

    it('the lead supplies the email, name, phone, company and ticket - unless one is already saved', async function () {
      const chatbot = fakeChatbot(undefined, { [K.REQ_LEAD_EMAIL_KEY]: "already@saved.test" });
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {
        request: {
          ticket_id: "T-1",
          lead: {
            _id: "L-1", email: "new@test.test", fullname: "Ada L", phone: "+39000",
            company: "ACME", lead_id: "wab-393331112222-xyz"
          }
        }
      }, "P1", "support-group-P1-abcd");

      assert.strictEqual(chatbot.params[K.REQ_LEAD_EMAIL_KEY], "already@saved.test",
        'a saved lead email is never overwritten by a later one');
      assert.strictEqual(chatbot.params[K.REQ_LEAD_USERFULLNAME_KEY], "Ada L");
      assert.strictEqual(chatbot.params[K.REQ_USER_PHONE_KEY], "+39000");
      assert.strictEqual(chatbot.params[K.REQ_USER_LEAD_ID_KEY], "L-1");
      assert.strictEqual(chatbot.params[K.REQ_USER_COMPANY_KEY], "ACME");
      assert.strictEqual(chatbot.params[K.REQ_TICKET_ID_KEY], "T-1");
      assert.strictEqual(chatbot.params[K.REQ_CURRENT_PHONE_NUMBER_KEY], "393331112222",
        'a wab- lead id carries the phone number in its second segment');
    });

    it('a lead id with no recognised prefix leaves the current phone number unset', async function () {
      const chatbot = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {
        request: { lead: { lead_id: "web-123-xyz", email: "a@b.test" } }
      }, "P1", "support-group-P1-abcd");
      assert.strictEqual(chatbot.params[K.REQ_CURRENT_PHONE_NUMBER_KEY], undefined);
    });

    it('the request location becomes the country and city attributes', async function () {
      const chatbot = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {
        request: { location: { country: "Italy", city: "Rome" } }
      }, "P1", "support-group-P1-abcd");
      assert.strictEqual(chatbot.params[K.REQ_COUNTRY_KEY], "Italy");
      assert.strictEqual(chatbot.params[K.REQ_CITY_KEY], "Rome");
    });

    it('an Accept-Language header is reduced to its language code', async function () {
      const chatbot = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {
        request: {
          language: "it-IT,it;q=0.9,en;q=0.8", sourcePage: "https://x.test/pricing",
          userAgent: "Mozilla/5.0", requester: { isAuthenticated: true },
          attributes: { decoded_jwt: { sub: "u-1" } }
        }
      }, "P1", "support-group-P1-abcd");

      assert.strictEqual(chatbot.params[K.REQ_USER_LANGUAGE_KEY], "it");
      assert.strictEqual(chatbot.params[K.REQ_USER_SOURCE_PAGE_KEY], "https://x.test/pricing");
      assert.strictEqual(chatbot.params[K.REQ_USER_AGENT_KEY], "Mozilla/5.0");
      assert.deepStrictEqual(chatbot.params[K.REQ_DECODED_JWT_KEY], { sub: "u-1" });
      assert.strictEqual(chatbot.params[K.REQ_REQUESTER_IS_AUTHENTICATED_KEY], true);
    });

    it('an anonymous requester is recorded as not authenticated, not as missing', async function () {
      const chatbot = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", { request: {} },
        "P1", "support-group-P1-abcd");
      assert.strictEqual(chatbot.params[K.REQ_REQUESTER_IS_AUTHENTICATED_KEY], false);
    });

    it('the department comes from the request, or from the message attributes as a fallback', async function () {
      const fromRequest = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(fromRequest, "T", {
        request: { department: { departmentId: "D-1", departmentName: "Sales" } }
      }, "P1", "support-group-P1-abcd");
      assert.strictEqual(fromRequest.params[K.REQ_DEPARTMENT_ID_KEY], "D-1");
      assert.strictEqual(fromRequest.params[K.REQ_DEPARTMENT_NAME_KEY], "Sales");

      const fromAttributes = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(fromAttributes, "T", {
        attributes: { _id: "D-2", name: "Support" }
      }, "P1", "support-group-P1-abcd");
      assert.strictEqual(fromAttributes.params[K.REQ_DEPARTMENT_ID_KEY], "D-2");
      assert.strictEqual(fromAttributes.params[K.REQ_DEPARTMENT_NAME_KEY], "Support");
    });

    it('the eight email attributes are copied across when the message carries them', async function () {
      const chatbot = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {
        attributes: {
          email_subject: "Invoice", email_toEmail: "to@test.test", email_fromEmail: "from@test.test",
          email_messageId: "<m-1@test>", email_replyTo: "reply@test.test", email_eml: "raw",
          link: "https://x.test/a.pdf", attachments: ["a.pdf"]
        }
      }, "P1", "support-group-P1-abcd");

      assert.strictEqual(chatbot.params[K.REQ_EMAIL_SUBJECT], "Invoice");
      assert.strictEqual(chatbot.params[K.REQ_EMAIL_TO], "to@test.test");
      assert.strictEqual(chatbot.params[K.REQ_EMAIL_FROM], "from@test.test");
      assert.strictEqual(chatbot.params[K.REQ_EMAIL_MESSAGE_ID], "<m-1@test>");
      assert.strictEqual(chatbot.params[K.REQ_EMAIL_REPLY_TO], "reply@test.test");
      assert.strictEqual(chatbot.params[K.REQ_EMAIL_EML], "raw");
      assert.strictEqual(chatbot.params[K.REQ_EMAIL_ATTACHMENTS_LINK], "https://x.test/a.pdf");
      assert.deepStrictEqual(chatbot.params[K.REQ_EMAIL_ATTACHMENTS_FILES], ["a.pdf"]);
    });

    it('every payload entry becomes its own flow attribute, plus the whole payload', async function () {
      const chatbot = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {
        attributes: { requester_id: "u-1", ipAddress: "1.2.3.4", payload: { plan: "premium", seats: 3 } }
      }, "P1", "support-group-P1-abcd");

      assert.strictEqual(chatbot.params.plan, "premium");
      assert.strictEqual(chatbot.params.seats, 3);
      assert.deepStrictEqual(chatbot.params.payload, { plan: "premium", seats: 3 });
      assert.strictEqual(chatbot.params[K.REQ_END_USER_ID_KEY], "u-1");
      assert.strictEqual(chatbot.params[K.REQ_END_USER_IP_ADDRESS_KEY], "1.2.3.4");
    });

    it('a payload on the request is merged into the message payload', async function () {
      const chatbot = fakeChatbot();
      const message = { request: { attributes: { payload: { fromRequest: 1 } } } };
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", message, "P1", "support-group-P1-abcd");

      assert.deepStrictEqual(message.attributes.payload, { fromRequest: 1 });
      assert.strictEqual(chatbot.params.fromRequest, 1);
    });

    it('the voice attributes are copied out of the message attributes', async function () {
      const chatbot = fakeChatbot();
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {
        attributes: { dnis: "+39111", callId: "c-1", ani: "+39222" }
      }, "P1", "support-group-P1-abcd");

      assert.strictEqual(chatbot.params.dnis, "+39111");
      assert.strictEqual(chatbot.params.callId, "c-1");
      assert.strictEqual(chatbot.params.ani, "+39222");
    });

    it('the bot globals are added as flow attributes', async function () {
      const chatbot = fakeChatbot({
        name: "Test Bot", _id: "BOT-1",
        attributes: { globals: [{ key: "company", value: "ACME" }, { key: "tier", value: "gold" }] }
      });
      await ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {}, "P1", "support-group-P1-abcd");

      assert.strictEqual(chatbot.params.company, "ACME");
      assert.strictEqual(chatbot.params.tier, "gold");
    });

    it('a cache that cannot write rethrows instead of killing the process', async function () {
      const chatbot = fakeChatbot();
      chatbot.addParameter = async () => { throw new Error("redis is gone"); };

      await assert.rejects(
        () => ChatbotRequestAttributesUtil.updateRequestAttributes(chatbot, "T", {}, "P1", "support-group-P1-abcd"),
        /redis is gone/,
        'the caller aborts just this message; the helper must not terminate its host');
    });

  });

  describe('ChatbotRequestAttributesUtil, the pure helpers', function () {

    it('validateRequestId accepts a well formed support-group id for this project', function () {
      assert.strictEqual(ChatbotRequestAttributesUtil.validateRequestId("support-group-P1-abcd", "P1"), true);
      assert.strictEqual(ChatbotRequestAttributesUtil.validateRequestId("support-group-P2-abcd", "P1"), false,
        'another project may not drive this one');
      assert.strictEqual(ChatbotRequestAttributesUtil.validateRequestId("support-group-P1", "P1"), false);
      assert.strictEqual(ChatbotRequestAttributesUtil.validateRequestId("support-group-P1--", "P1"), false);
    });

    it('validateRequestId accepts a four or five part automation-request id', function () {
      assert.strictEqual(ChatbotRequestAttributesUtil.validateRequestId("automation-request-P1-abcd", "P1"), true);
      assert.strictEqual(ChatbotRequestAttributesUtil.validateRequestId("automation-request-P1-abcd-2", "P1"), true);
      assert.strictEqual(ChatbotRequestAttributesUtil.validateRequestId("automation-request-P1-abcd-2-3", "P1"), false);
      assert.strictEqual(ChatbotRequestAttributesUtil.validateRequestId("automation-request-P2-abcd", "P1"), false);
    });

    it('validateRequestId refuses anything with neither prefix', function () {
      assert.strictEqual(ChatbotRequestAttributesUtil.validateRequestId("whatever", "P1"), false);
      assert.strictEqual(ChatbotRequestAttributesUtil.validateRequestId("", "P1"), false);
    });

    it('userFlowAttributes hides the reserved, underscored and requestId keys', function () {
      const shown = ChatbotRequestAttributesUtil.userFlowAttributes({
        plan: "premium",
        _internal: "hidden",
        "support-group-P1-abcd": "the requestId bug",
        [TiledeskChatbotConst.REQ_PROJECT_ID_KEY]: "P1",
        [TiledeskChatbotConst.REQ_LAST_USER_TEXT_KEY]: "hello"
      });
      assert.deepStrictEqual(shown, { plan: "premium" });
    });

    it('userFlowAttributes on nothing gives an empty object', function () {
      assert.deepStrictEqual(ChatbotRequestAttributesUtil.userFlowAttributes(null), {});
      assert.deepStrictEqual(ChatbotRequestAttributesUtil.userFlowAttributes(undefined), {});
    });

  });

  // ----------------------------------------------------- TiledeskChatbotUtil

  describe('TiledeskChatbotUtil, the facade', function () {

    it('every static delegates to the module that owns it', function () {
      assert.deepStrictEqual(TiledeskChatbotUtil.parseIntent("welcome"), { name: "welcome" });
      assert.strictEqual(TiledeskChatbotUtil.isHiddenMessage({ attributes: { subtype: "info" } }), true);
      assert.strictEqual(TiledeskChatbotUtil.isAudioMessage({ type: "text" }), false);
      assert.strictEqual(TiledeskChatbotUtil.stripEmoji(null), null);
      assert.strictEqual(TiledeskChatbotUtil.isValidReply(commandsFor(["hi"])), true);
      assert.strictEqual(TiledeskChatbotUtil.totalMessageWait(commandsFor(["hi"])), 500);
      assert.strictEqual(TiledeskChatbotUtil.buttonByText(null, []), null);
      assert.deepStrictEqual(TiledeskChatbotUtil.allReplyButtons({ attributes: {} }), []);
      assert.deepStrictEqual(TiledeskChatbotUtil.actionsToDirectives([]), []);
      assert.strictEqual(TiledeskChatbotUtil.validateRequestId("support-group-P1-abcd", "P1"), true);
      assert.deepStrictEqual(TiledeskChatbotUtil.userFlowAttributes({ a: 1, _b: 2 }), { a: 1 });
      assert.strictEqual(TiledeskChatbotUtil.lastUserMessageFrom({ _id: "m-1" }).id, "m-1");
      assert.deepStrictEqual(TiledeskChatbotUtil.transcriptJSON(""), []);
      assert.strictEqual(TiledeskChatbotUtil.renderJSONButtons('[bad json', {}), null);
      assert.ok(TiledeskChatbotUtil.AiConditionPromptBuilder("H", [], "I").startsWith("H"));
    });

    it('chooseRandomReply and the two message rewriters are reachable through the facade', function () {
      const random = TiledeskChatbotUtil.chooseRandomReply(commandsFor(["one", "two"]));
      assert.strictEqual(random.length, 2);

      const toClean = commandsFor(["kept", "  "]);
      assert.strictEqual(TiledeskChatbotUtil.removeEmptyReplyCommands(toClean).attributes.commands.length, 2);

      const withCondition = commandsFor(["a"]);
      TiledeskChatbotUtil.filterOnVariables(withCondition, { x: 1 });
      assert.strictEqual(withCondition.text, "a");

      const command = { message: { attributes: { attachment: { buttons: [{ value: "{{who}}" }] } } } };
      TiledeskChatbotUtil.fillCommandAttachments(command, { who: "ada" });
      assert.strictEqual(command.message.attributes.attachment.buttons[0].value, "ada");

      const reply = { attributes: { nextBlockAction: { _tdActionType: "intent" } }, actions: [] };
      TiledeskChatbotUtil.addConnectAction(reply);
      assert.strictEqual(reply.actions.length, 1);
    });

    it('the gallery and button rewriters are reachable through the facade', function () {
      const message = { attributes: { commands: [{
        type: "message",
        message: { attributes: { attachment: { json_gallery: '[{"title":"T"}]' } } }
      }] } };
      TiledeskChatbotUtil.replaceJSONGalleries(message, {});
      assert.strictEqual(message.attributes.commands[0].message.attributes.attachment.gallery.length, 1);

      const buttonsMessage = { attributes: { commands: [{
        type: "message",
        message: { attributes: { attachment: { json_buttons: '[{"value":"Go","type":"text"}]' } } }
      }] } };
      TiledeskChatbotUtil.replaceJSONButtons(buttonsMessage, {});
      assert.strictEqual(buttonsMessage.attributes.commands[0].message.attributes.attachment.buttons[0].value, "Go");
    });

    it('the transcript statics are reachable through the facade', async function () {
      const chatbot = fakeChatbot({ name: "Test Bot" });
      await TiledeskChatbotUtil.updateConversationTranscript(chatbot, { text: "hi", senderFullname: "Ada" });
      assert.strictEqual(chatbot.params.transcript, "<user:Ada> hi");
      await TiledeskChatbotUtil.clearConversationTranscript(chatbot);
      assert.strictEqual(chatbot.params.transcript, "");
    });

    it('updateRequestAttributes is reachable through the facade', async function () {
      const chatbot = fakeChatbot();
      await TiledeskChatbotUtil.updateRequestAttributes(chatbot, "T", { _id: "m-1" }, "P1", "support-group-P1-abcd");
      assert.strictEqual(chatbot.params[TiledeskChatbotConst.REQ_PROJECT_ID_KEY], "P1");
    });

  });

  // -------------------------------------------------- ChatbotParametersClient

  describe('ChatbotParametersClient', function () {

    let tilebot;
    let handler = (req, res) => res.status(200).send({ ok: true });
    let seen = [];

    before((done) => {
      const server = express();
      server.use(bodyParser.json());
      server.all('*', (req, res) => { seen.push(req.originalUrl); handler(req, res); });
      tilebot = server.listen(TILEBOT_PORT, '0.0.0.0', () => done());
    });
    after((done) => { tilebot.close(() => done()); });
    beforeEach(() => { seen = []; handler = (req, res) => res.status(200).send({ ok: true }); });

    it('the parameters are read from the tilebot reserved endpoint for that request', function (done) {
      handler = (req, res) => res.status(200).send({ plan: "premium" });
      new ChatbotParametersClient().getChatbotParameters("support-group-P1-abcd", (err, body) => {
        try {
          assert.strictEqual(err, null);
          assert.deepStrictEqual(body, { plan: "premium" });
          assert.deepStrictEqual(seen, ["/ext/reserved/parameters/requests/support-group-P1-abcd?all"]);
          done();
        } catch (e) { done(e); }
      });
    });

    it('myrequest reports the body of a 200 and logs nothing the caller must read', function (done) {
      new ChatbotParametersClient().myrequest(
        { url: 'http://localhost:' + TILEBOT_PORT + '/anything', method: 'get' },
        (err, body) => {
          try {
            assert.strictEqual(err, null);
            assert.deepStrictEqual(body, { ok: true });
            done();
          } catch (e) { done(e); }
        }, true);
    });

    // DEFECT - utils/ChatbotParametersClient.js:72
    //
    //   callback(TiledeskClient.getErr({ message: "Response status not 200" }, options, res), null, null);
    //
    // `TiledeskClient` is not required anywhere in this file (nor in
    // TiledeskChatbotUtil, which inherits the method), so the ONE branch that
    // reports a non-200 answer throws "ReferenceError: TiledeskClient is not
    // defined". It throws inside the axios .then(), so the promise rejects, the
    // callback is never called and getChatbotParameters' caller waits forever.
    // A tilebot that answers 204, or 200 with an empty body, is enough.
    //
    // Correct behaviour, asserted here: report the failure to the callback, the
    // way the .catch() below it does.
    it('a non-200 from tilebot reaches the callback as an error', function (done) {
      handler = (req, res) => res.status(204).send();
      new ChatbotParametersClient().getChatbotParameters("support-group-P1-abcd", (err, body) => {
        try {
          assert.ok(err, 'the caller must be told the parameters could not be read');
          assert.strictEqual(body, undefined);
          done();
        } catch (e) { done(e); }
      });
    });

    // DEFECT - utils/ChatbotParametersClient.js:81
    //
    //   .catch((error) => {
    //     winston.error("(TiledeskChatbotUtil) Axios error: ", error.response.data);
    //
    // `error.response` is undefined for every transport failure - connection
    // refused, DNS, socket reset, timeout - which is exactly what this catch
    // exists for. Reading `.data` off it throws inside the handler, so
    // `callback(error, null, null)` on the next line never runs and the caller
    // waits forever. Identical to the DirWebRequest defect fixed in this
    // wave (directives/data/DirWebRequest.js:153).
    //
    // Correct behaviour, asserted here: log it and hand the error to the
    // callback.
    it('a tilebot that is not listening reaches the callback as an error', function (done) {
      new ChatbotParametersClient().myrequest(
        { url: 'http://127.0.0.1:10099/nothing', method: 'get' },
        (err) => {
          try {
            assert.ok(err, 'a refused connection must reach the callback');
            done();
          } catch (e) { done(e); }
        }, false);
    });

  });

  // ---------------------------------------------------------- the http helpers

  describe('utils/http and utils/HttpUtils', function () {

    let mock;
    let handler;

    beforeEach(async () => {
      handler = (req, res) => res.status(200).send({ ok: true });
      mock = await startMock((req, res) => handler(req, res));
    });
    afterEach(async () => { await mock.close(); });

    it('http.request sends the body, the params and the headers it was given', function (done) {
      http.request({
        url: MOCK + '/echo', method: 'POST',
        headers: { 'x-test': 'yes' }, params: { q: '1' }, json: { a: 1 }
      }, (err, body) => {
        try {
          assert.strictEqual(err, null);
          assert.deepStrictEqual(body, { ok: true });
          assert.strictEqual(mock.seen[0].url, '/echo?q=1');
          assert.strictEqual(mock.seen[0].headers['x-test'], 'yes');
          assert.deepStrictEqual(mock.seen[0].body, { a: 1 });
          done();
        } catch (e) { done(e); }
      });
    });

    it('http.request treats a status outside the accepted list as an error', function (done) {
      handler = (req, res) => res.status(201).send({ created: true });
      http.request({ url: MOCK + '/x', method: 'GET', json: null }, (err, body) => {
        try {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, "Response status is not 200");
          assert.strictEqual(body, null);
          done();
        } catch (e) { done(e); }
      });
    });

    it('acceptedStatusCodes widens what counts as a success', function (done) {
      handler = (req, res) => res.status(201).send({ created: true });
      http.request({ url: MOCK + '/x', method: 'GET', json: null }, (err, body) => {
        try {
          assert.strictEqual(err, null);
          assert.deepStrictEqual(body, { created: true });
          done();
        } catch (e) { done(e); }
      }, { acceptedStatusCodes: [200, 201] });
    });

    it('statusErrorMessage names the failure the caller wants to read', function (done) {
      // A 4xx/5xx REJECTS in axios and reaches the .catch() with the raw axios
      // error; statusErrorMessage only names the status the .then() refused.
      handler = (req, res) => res.status(201).send({ created: true });
      http.request({ url: MOCK + '/x', method: 'GET', json: null }, (err) => {
        try {
          assert.strictEqual(err.message, "the vendor refused it");
          done();
        } catch (e) { done(e); }
      }, { statusErrorMessage: "the vendor refused it" });
    });

    it('fallbackToRequestData hands back the REQUEST body when the answer is empty', function (done) {
      handler = (req, res) => res.status(204).send();
      http.request({ url: MOCK + '/x', method: 'POST', json: { sent: true } }, (err, body) => {
        try {
          assert.strictEqual(err, null);
          assert.strictEqual(body, JSON.stringify({ sent: true }),
            'the request body is a FALLBACK, and it arrives exactly once');
          done();
        } catch (e) { done(e); }
      }, { acceptedStatusCodes: [204], fallbackToRequestData: true });
    });

    it('http.request hands a refused connection to the callback', function (done) {
      http.request({ url: 'http://127.0.0.1:10099/nothing', method: 'GET', json: null }, (err, body) => {
        try {
          assert.ok(err, 'a transport failure must reach the callback');
          assert.strictEqual(body, null);
          done();
        } catch (e) { done(e); }
      });
    });

    it('HttpUtils.request accepts any 2xx and reports the body', function (done) {
      handler = (req, res) => res.status(202).send({ accepted: true });
      httpUtils.request({ url: MOCK + '/x', method: 'GET', json: null }, (err, body) => {
        try {
          assert.strictEqual(err, null);
          assert.deepStrictEqual(body, { accepted: true });
          done();
        } catch (e) { done(e); }
      });
    });

    it('HttpUtils.request reports a 2xx with no body as an error', function (done) {
      handler = (req, res) => res.status(204).send();
      httpUtils.request({ url: MOCK + '/x', method: 'GET', json: null }, (err, body) => {
        try {
          assert.strictEqual(err.message, "Response status is not 2xx");
          assert.strictEqual(body, null);
          done();
        } catch (e) { done(e); }
      });
    });

    it('HttpUtils.request hands a 4xx to the callback with the axios response attached', function (done) {
      handler = (req, res) => res.status(404).send({ error: "nope" });
      httpUtils.request({ url: MOCK + '/x', method: 'GET', json: null }, (err) => {
        try {
          assert.deepStrictEqual(err.response.data, { error: "nope" });
          done();
        } catch (e) { done(e); }
      });
    });

    it('HttpUtils.request hands a refused connection to the callback', function (done) {
      httpUtils.request({ url: 'http://127.0.0.1:10099/nothing', method: 'GET', json: null }, (err, body) => {
        try {
          assert.ok(err);
          assert.strictEqual(err.response, undefined, 'a transport failure carries no response');
          assert.strictEqual(body, null);
          done();
        } catch (e) { done(e); }
      });
    });

    it('HttpUtils.fixToken adds the JWT prefix exactly once', function () {
      assert.strictEqual(httpUtils.fixToken("XXX"), "JWT XXX");
      assert.strictEqual(httpUtils.fixToken("JWT XXX"), "JWT XXX");
    });

    it('HttpUtils.getErr bundles the error, the request and the response together', function () {
      const bundled = require('../utils/HttpUtils').constructor.getErr({ message: "boom" }, { url: "u" }, { status: 500 });
      assert.deepStrictEqual(bundled, {
        http_err: { message: "boom" }, http_request: { url: "u" }, http_response: { status: 500 }
      });
    });

  });

});
