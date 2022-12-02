var assert = require('assert');
const { ExtUtil } = require('../ExtUtil');
const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { DirWhenOpen } = require('../tiledeskChatbotPlugs/directives/DirWhenOpen');
const supportRequest = require('./support_request.js').request;

describe('Directives', function() {
  
  it('test directives and splits', async () => {
    const message_text = `message1

message2
* button1
\\_tdWait`;
    const answer = {
      text: message_text,
      attributes: {
          splits: true,
          directives: true,
          markbot: true,
          disableInputMessage: true,
          inputMessagePlaceholder: 'Compile the form before proceeding'
      }
    }
    let directivesPlug = new DirectivesChatbotPlug({supportRequest: supportRequest, TILEDESK_API_ENDPOINT: "APIURL", token: "token", log: false, HELP_CENTER_API_ENDPOINT: "HELP_CENTER_API_ENDPOINT"});
    const bot_answer = await ExtUtil.execPipelineExt(supportRequest, answer, directivesPlug, null, false);
    // console.log("bot as obj", bot_answer);
    // console.log("bot", JSON.stringify(bot_answer));
    assert.strictEqual(bot_answer.text, "message1\n\nmessage2");
    assert(bot_answer.attributes.commands != null);
    assert(bot_answer.attributes.commands.length == 3);

    // console.log("Directives:", directivesPlug.directives)
    assert(directivesPlug.directives != null);
    assert(directivesPlug.directives.length == 1);
    assert(directivesPlug.directives[0].name.toLowerCase() == "wait");
  });
    
});



