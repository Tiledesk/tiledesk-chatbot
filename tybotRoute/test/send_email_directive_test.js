var assert = require('assert');
const { ExtUtil } = require('../ExtUtil');
const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { DirSendEmail } = require('../tiledeskChatbotPlugs/directives/DirSendEmail');
const supportRequest = require('./support_request.js').request;

describe('Directive DirSendEmail', function() {

  it('test directive DirSendEmail', async () => {
    class MockTdClient {
      async sendEmail(message, callback) {
        if (callback) {
          callback(null, message);
        }
        return message;
      }
    };
    send_email_directive = {
      name: "sendemail",
      parameter: '--to "test@test" --subject "test" --text "test"'
    };
    let dir = new DirSendEmail({
        tdclient: new MockTdClient()
    });
    let requestId = null;
    const message =  await dir.execute(send_email_directive, requestId) //, "err").to.be.null;
    // console.error("Was expecting an error for the 'to' missing parameter");
    console.log("message:", message);
    assert(message);
    assert(message.to);
    assert(message.text);
    assert(message.subject);
  });

  it('test directive DirSendEmail with missing "to"', async () => {
    class MockTdClient {
      async sendEmail(message, callback) {
        if (callback) {
          callback(null, message);
        }
        return message;
      }
    };
    send_email_directive = {
      name: "sendemail",
      parameter: '--subject "test" --text "_test"'
    };
    let dir = new DirSendEmail({
        tdclient: new MockTdClient()
    });
    let requestId = null;
    // try {
      const message =  await dir.execute(send_email_directive, requestId) //, "err").to.be.null;
      // console.error("Was expecting an error for the 'to' missing parameter");
      assert(message == null);
    // }
    // catch(err) {
    //   //console.log("Error is ok", err);
    //   if (!err.message.startsWith("sendEmail missing mandatory parameters")) {
    //     assert.ok(false);
    //   }
    // }
  });

  it('test directive DirSendEmail in pipeline', async () => {
    const message_text = `\\_tdsendemail --to "test@test" --subject "_sub" --text "_body"`;
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
    assert(directivesPlug.directives[0].name === "sendemail");
    assert(directivesPlug.directives[0].parameter === '--to "test@test" --subject "_sub" --text "_body"');
  });
    
});



