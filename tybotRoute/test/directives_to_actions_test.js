var assert = require('assert');
const { DirectivesToActions } = require('../tiledeskChatbotPlugs/directives/DirectivesToActions');

describe('Directives parse to Actions', function () {

    it('test AGENT to Action', async () => {
        let directives = [
            {
                "name": "agent",
                "parameter": null
            }
        ];
        let actions = DirectivesToActions.parse(directives);
        assert(actions.length === 1);
        assert(actions[0].type === "agent");
        console.log("Actions:", actions);
    });

    it('test MESSAGE to Action', async () => {
        let directives = [
            {
                "name": "message",
                "parameter": "Message text"
            }
        ];
        let actions = DirectivesToActions.parse(directives);
        assert(actions.length === 1);
        assert(actions[0].type === "message");
        assert(actions[0].message.text === "Message text");
        console.log("Actions:", actions);
    });

});



