var assert = require('assert');
const { ExtUtil } = require('../ExtUtil');
const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { DirClose } = require('../tiledeskChatbotPlugs/directives/DirClose');
const supportRequest = require('./support_request.js').request;

describe('Directive DirClose', function() {

  it('test directive DirClose', async () => {
    class MockTdClient {
      closeRequest(request_id, callback) {
          callback(null, {});
      }
    };
    close_directive = {
      name: "close"
    };
    let dir = new DirClose({
        tdclient: new MockTdClient()
    });
    dir.execute(close_directive, "A-REQUEST-ID", () => {
    });
  });

  it('test directive DirClose in pipeline', async () => {
    const message_text = `\\_tdclose`;
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
    assert(bot_answer == null);
    assert(directivesPlug.directives != null);
    assert(directivesPlug.directives.length == 1);
    assert(directivesPlug.directives[0].name === "close");
  });
    
});



