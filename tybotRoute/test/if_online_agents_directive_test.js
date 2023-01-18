var assert = require('assert');
const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { DirIfOnlineAgents } = require('../tiledeskChatbotPlugs/directives/DirIfOnlineAgents');

describe('Directive DirIfOnlineAgents', function() {

  it('DirIfOnlineAgents true & false intents (online agents > 0)', async () => {
    class MockTdClient {
      openNow(callback) {
          callback(null, {});
      }
      getProjectAvailableAgents(callback) {
        callback(null, [{}]); // one agent
      }
    };
    close_directive = {
      name: "close"
    };
    let dir = new DirClose({
        tdclient: new MockTdClient(),
        requestId: "A-REQUEST-ID"
    });
    dir.execute(close_directive, () => {
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
    // console.log("bot_answer:", bot_answer)
    // console.log("directivesPlug.directives", directivesPlug.directives);
    assert(bot_answer == null);
    assert(directivesPlug.directives != null);
    assert(directivesPlug.directives.length == 1);
    assert(directivesPlug.directives[0].name === "close");
  });
    
});



