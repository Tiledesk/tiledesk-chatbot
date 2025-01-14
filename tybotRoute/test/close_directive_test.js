var assert = require('assert');
const { ExtUtil } = require('../ExtUtil');
const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { DirClose } = require('../tiledeskChatbotPlugs/directives/DirClose');
const supportRequest = require('./support_request.js').request;

describe('Directive DirClose', function() {

  // it('test directive DirClose', async () => {
  //   class MockTdClient {
  //     closeRequest(request_id, callback) {
  //         callback(null, {});
  //     }
  //   };
  //   close_directive = {
  //     name: "close"
  //   };
  //   let dir = new DirClose({
  //       projectId: "projectID",
  //       API_ENDPOINT: process.env.API_ENDPOINT,
  //       token: "XXX",
  //       tdclient: new MockTdClient(),
  //       requestId: "A-REQUEST-ID"
  //   });
  //   dir.execute(close_directive, () => {
  //   });
  // });

  // it('test directive DirClose in pipeline', async () => {
  //   const message_text = `\\_tdclose`;
  //   const answer = {
  //     text: message_text,
  //     attributes: {
  //         splits: true,
  //         directives: true,
  //         markbot: true
  //     }
  //   }
  //   let directivesPlug = new DirectivesChatbotPlug({supportRequest: supportRequest, projectId: supportRequest.id_project, chatbot: null, API_ENDPOINT: "APIURL", token: "token", log: false, HELP_CENTER_API_ENDPOINT: "HELP_CENTER_API_ENDPOINT"});
  //   const bot_answer = await ExtUtil.execPipelineExt(supportRequest, answer, directivesPlug, null, false);
  //   // console.log("bot_answer:", bot_answer)
  //   // console.log("directivesPlug.directives", directivesPlug.directives);
  //   assert(bot_answer == null);
  //   assert(directivesPlug.directives != null);
  //   assert(directivesPlug.directives.length == 1);
  //   assert(directivesPlug.directives[0].name === "close");
  // });
    
});



