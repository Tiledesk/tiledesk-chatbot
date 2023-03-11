var assert = require('assert');
const { ExtUtil } = require('../ExtUtil');
const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');
const supportRequest = require('./support_request.js').request;

describe('Directive DirDisableInputText', function() {

  it('test directive DisableInputText (basic)', async () => {
    const message_text = `message1
message2
* button1
\\_tddisableinputtext`;
    const answer = {
      text: message_text,
      attributes: {
          splits: true,
          directives: true,
          markbot: true
      }
    }
    let directivesPlug = new DirectivesChatbotPlug({supportRequest: supportRequest, TILEDESK_API_ENDPOINT: "APIURL", token: "token", log: false, HELP_CENTER_API_ENDPOINT: "HELP_CENTER_API_ENDPOINT"});
    const bot_answer = await ExtUtil.execPipelineExt(supportRequest, answer, directivesPlug, null, false);
    assert.strictEqual(bot_answer.text, "message1\nmessage2");
    assert(bot_answer.attributes.commands == null);
    assert(bot_answer.attributes.disableInputMessage == true);
    assert(directivesPlug.directives != null);
    assert(directivesPlug.directives.length == 1);
    assert(directivesPlug.directives[0].name.toLowerCase() == "disableinputtext");
  });

  it('test directive DisableInputText (placeholder message option: --label)', async () => {
    const message_text = `message1
message2
* button1
\\_tddisableinputtext --label "Press a button to reply"`;
    const answer = {
      text: message_text,
      attributes: {
          splits: true,
          directives: true,
          markbot: true
      }
    }
    let directivesPlug = new DirectivesChatbotPlug({supportRequest: supportRequest, TILEDESK_API_ENDPOINT: "APIURL", token: "token", log: false, HELP_CENTER_API_ENDPOINT: "HELP_CENTER_API_ENDPOINT"});
    const bot_answer = await ExtUtil.execPipelineExt(supportRequest, answer, directivesPlug, null, false);
    // console.log("bot as obj", bot_answer);
    // console.log("bot", JSON.stringify(bot_answer));
    assert.strictEqual(bot_answer.text, "message1\nmessage2");
    assert(bot_answer.attributes.commands == null);
    assert(bot_answer.attributes.disableInputMessage == true);
    assert(bot_answer.attributes.inputMessagePlaceholder === "Press a button to reply");
    // console.log("Directives:", directivesPlug.directives)
    assert(directivesPlug.directives != null);
    assert(directivesPlug.directives.length == 1);
    assert(directivesPlug.directives[0].name.toLowerCase() == "disableinputtext");
  });

  it('test directive DisableInputText (placeholder message, short form option: -l)', async () => {
    const message_text = `message1
message2
* button1
\\_tddisableinputtext -l "Press a button to reply"`;
    const answer = {
      text: message_text,
      attributes: {
          splits: true,
          directives: true,
          markbot: true
      }
    }
    let directivesPlug = new DirectivesChatbotPlug({supportRequest: supportRequest, TILEDESK_API_ENDPOINT: "APIURL", token: "token", log: false, HELP_CENTER_API_ENDPOINT: "HELP_CENTER_API_ENDPOINT"});
    const bot_answer = await ExtUtil.execPipelineExt(supportRequest, answer, directivesPlug, null, false);
    // console.log("bot as obj", bot_answer);
    // console.log("bot", JSON.stringify(bot_answer));
    assert.strictEqual(bot_answer.text, "message1\nmessage2");
    assert(bot_answer.attributes.commands == null);
    assert(bot_answer.attributes.disableInputMessage == true);
    assert(bot_answer.attributes.inputMessagePlaceholder === "Press a button to reply");
    // console.log("Directives:", directivesPlug.directives)
    assert(directivesPlug.directives != null);
    assert(directivesPlug.directives.length == 1);
    assert(directivesPlug.directives[0].name.toLowerCase() == "disableinputtext");
  });
    
});



