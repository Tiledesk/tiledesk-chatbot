var assert = require('assert');
const { ExtUtil } = require('../ExtUtil');
const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { DirSendEmail } = require('../tiledeskChatbotPlugs/directives/DirSendEmail');
const supportRequest = require('./support_request.js').request;
const { TiledeskChatbot } = require('../engine/TiledeskChatbot.js');

describe('Directive DirSendEmail', function() {

  // it('test DirSendEmail', async () => {
  //   class MockTdClient {
  //     async sendEmail(message, callback) {
  //       if (callback) {
  //         callback(null, message);
  //       }
  //       return message;
  //     }
  //   };
  //   class MockTdCache {
  //     async hgetall(request_parameters_key) {
  //       // simulate we already saved sone request variables
  //       // with a specific request id: request1
  //       const request1_cache_id = TiledeskChatbot.requestCacheKey('request1') + ":parameters";
  //       const variables = {}
  //       variables[request1_cache_id] = {
  //         "fullname": "John B.",
  //         "email": "johnb@email.com"
  //       }
  //       return variables[request_parameters_key];
  //     }
  //   };
  //   send_email_directive = {
  //     name: "sendemail",
  //     parameter: '--to "${email}" --subject "Hello ${fullname}" --text "Welcome ${fullname}"'
  //   };
  //   let requestId = "request1";
  //   let context = {

  //   }
  //   let dir = new DirSendEmail({
  //       tdclient: new MockTdClient(),
  //       tdcache: new MockTdCache(),
  //       requestId: requestId
  //   });
  //   const message =  await dir.execute(send_email_directive);
  //   assert(message);
  //   assert(message.to === 'johnb@email.com');
  //   assert(message.text === 'Welcome John B.');
  //   assert(message.subject === 'Hello John B.');
  // });

  // it('test DirSendEmail with missing "to"', async () => {
  //   class MockTdClient {
  //     async sendEmail(message, callback) {
  //       if (callback) {
  //         callback(null, message);
  //       }
  //       return message;
  //     }
  //   };
  //   send_email_directive = {
  //     name: "sendemail",
  //     parameter: '--subject "test" --text "_test"'
  //   };
  //   let dir = new DirSendEmail({
  //       tdclient: new MockTdClient()
  //   });
  //   const message =  await dir.execute(send_email_directive)
  //   assert(message == null);
  // });

  it('test DirSendEmail in pipeline', async () => {
    const message_text = `\\_tdsendemail --to "test@test" --subject "_sub" --text "_body"`;
    const answer = {
      text: message_text,
      attributes: {
          splits: true,
          directives: true,
          markbot: true
      }
    }
    let directivesPlug = new DirectivesChatbotPlug({supportRequest: supportRequest, API_ENDPOINT: "APIURL", token: "token", log: false, HELP_CENTER_API_ENDPOINT: "HELP_CENTER_API_ENDPOINT"});
    const bot_answer = await ExtUtil.execPipelineExt(supportRequest, answer, directivesPlug, null, false);
    assert(bot_answer == null);
    assert(directivesPlug.directives != null);
    assert(directivesPlug.directives.length == 1);
    assert(directivesPlug.directives[0].name === "sendemail");
    assert(directivesPlug.directives[0].parameter === '--to "test@test" --subject "_sub" --text "_body"');
  });
    
});



