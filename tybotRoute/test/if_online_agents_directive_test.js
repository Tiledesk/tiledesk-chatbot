var assert = require('assert');
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
    directive = {};
    let dir = new DirIfOnlineAgents({
        projectId: "projectID",
        token: "XXX",
        tdclient: new MockTdClient()
    });
    dir.execute(directive, () => {
    });
  });

  it('DirIfOnlineAgents true & false intents (online agents = 0)', async () => {
    class MockTdClient {
      openNow(callback) {
          callback(null, {});
      }
      getProjectAvailableAgents(callback) {
        callback(null, [{}]); // one agent
      }
    };
    directive = {};
    let dir = new DirIfOnlineAgents({
        projectId: "projectID",
        token: "XXX",
        tdclient: new MockTdClient()
    });
    dir.execute(directive, () => {
    });
  });
    
});



