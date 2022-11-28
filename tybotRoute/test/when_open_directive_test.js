var assert = require('assert');
const { ExtUtil } = require('../ExtUtil');
const { DirectivesChatbotPlug } = require('../tiledeskChatbotPlugs/DirectivesChatbotPlug');
const { DirWhenOpen } = require('../tiledeskChatbotPlugs/directives/DirWhenOpen');
const supportRequest = require('./support_request.js').request;

describe('Directives', function () {

    it('test DirWhenOpen (only one directive) checkOpen=true, matching isopen=true', async () => {
        let directives = [
            {
                "name": "whenopen",
                "parameter": "\\_tdintent start"
            }
        ];

        class MockTdClient {
            openNow(callback) {
                callback(null, { isopen: true });
            }
        };
        current_index = 0;
        when_directive = directives[current_index]
        let dir = new DirWhenOpen({
            tdclient: new MockTdClient()
        });
        dir.execute(when_directive, directives, current_index, () => {
            assert(directives.length == 2);
            assert(directives[1].name === "intent");
            assert(directives[1].parameter === "start");
        });
    });

    it('test DirWhenOpen (first directive) checkOpen=true, !matching because => isopen=false', async () => {
        let directives = [
            {
                "name": "whenopen",
                "parameter": "\\_tdintent start"
            },
            {
                "name": "dir1"
            },
            {
                "name": "dir3"
            }
        ];

        class MockTdClient {
            openNow(callback) {
                callback(null, { isopen: false }); // closed
            }
        };
        current_index = 0;
        when_directive = directives[current_index]
        let dir = new DirWhenOpen({
            tdclient: new MockTdClient(),
            checkOpen: true // checking open
        });
        dir.execute(when_directive, directives, current_index, () => {
            assert(directives.length == 3); // keeps the same length
            assert(directives[1].name === "dir1"); // no directives are added
            assert(directives[1].parameter == null);
        });
    });

    it('test DirWhenOpen (first directive) checkOpen=false, !matching because => isopen=true', async () => {
        let directives = [
            {
                "name": "whenopen",
                "parameter": "\\_tdintent start"
            },
            {
                "name": "dir1"
            },
            {
                "name": "dir3"
            }
        ];

        class MockTdClient {
            openNow(callback) {
                callback(null, { isopen: true }); // closed
            }
        };
        current_index = 0;
        when_directive = directives[current_index]
        let dir = new DirWhenOpen({
            tdclient: new MockTdClient(),
            checkOpen: false // checking open
        });
        dir.execute(when_directive, directives, current_index, () => {
            assert(directives.length == 3); // keeps the same length
            assert(directives[1].name === "dir1"); // no directives are added
            assert(directives[1].parameter == null);
        });
    });

    it('test DirWhenOpen (middle directive) checkOpen=true, matching isopen=true', async () => {
        let directives = [
            {
                "name": "dir1"
            },
            {
                "name": "whenopen",
                "parameter": "\\_tdintent start"
            },
            {
                "name": "dir3"
            }
        ];

        class MockTdClient {
            openNow(callback) {
                callback(null, { isopen: true });
            }
        };
        current_index = 1;
        when_directive = directives[current_index]
        let dir = new DirWhenOpen({
            tdclient: new MockTdClient()
        });
        dir.execute(when_directive, directives, current_index, () => {
            assert(directives.length == 4);
            assert(directives[2].name === "intent");
            assert(directives[2].parameter === "start");
            // done();
        });
    });

    it('test DirWhenOpen (last directive) checkOpen=false (closed), matching isopen=false', () => {
        let directives = [
            {
                "name": "dir1"
            },
            {
                "name": "dir3"
            },
            {
                "name": "whenopen",
                "parameter": "\\_tdfakedirective --m \"...\""
            }
        ];

        class MockTdClient {
            openNow(callback) {
                callback(null, { isopen: false }); // closed
            }
        };
        current_index = 2;
        when_directive = directives[current_index]
        let dir = new DirWhenOpen({
            tdclient: new MockTdClient(),
            checkOpen: false, // checks closed
            log: false
        });
        dir.execute(when_directive, directives, current_index, () => {
            assert(directives.length === 4);
            assert(directives[3].name === "fakedirective");
            assert(directives[3].parameter === "--m \"...\"");
        });

    });

});



