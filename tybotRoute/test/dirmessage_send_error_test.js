var assert = require('assert');
const { DirMessage } = require('../tiledeskChatbotPlugs/directives/DirMessage');

describe('Directive DirMessage - send error', function() {

  it('calls back when sending the reply fails', function(done) {
    const dir = new DirMessage({
      projectId: "projectID",
      requestId: "support-group-projectID-req",
      API_ENDPOINT: "http://localhost:1",
      token: "token"
    });
    dir.tdClient = {
      sendSupportMessage(requestId, message, callback) {
        callback(new Error("send failed"));
      }
    };
    const timer = setTimeout(() => done(new Error("callback never called")), 1000);
    dir.go({ type: "text", isInfo: true }, () => {
      clearTimeout(timer);
      done();
    }).catch((err) => {
      clearTimeout(timer);
      done(err);
    });
  });

});
