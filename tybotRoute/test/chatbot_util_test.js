var assert = require('assert');
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil');

describe('Intent name parsing', function() {
  
    it('parsing ""', async () => {
        const explicit_intent_name = "";
        const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
        // console.log("intent:", intent);
        assert(intent === null);
    });

    it('parsing "{}"', async () => {
        const explicit_intent_name = "{}";
        const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
        // console.log("intent:", intent);
        assert(intent.name === "");
        assert(intent.parameters !== null);
    });

    it('parsing "intent_name"', async () => {
        const explicit_intent_name = "intent_name";
        const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
        // console.log("intent:", intent);
        assert(intent !== null);
        assert(intent.name === "intent_name");
        assert(intent.parameters === undefined);
    });

    it('parsing "intent_name{}"', async () => {
        const explicit_intent_name = "intent_name{}";
        const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
        // console.log("intent:", intent);
        assert(intent !== null);
        assert(intent.name === "intent_name");
        assert(intent.parameters !== null);
    });

    it("parsing 'intent_name{valid JSON}'", async () => {
        const explicit_intent_name = 'intent_name{ "name": "myname", "age": 20}';
        const intent = TiledeskChatbotUtil.parseIntent(explicit_intent_name);
        // console.log("intent:", intent);
        assert(intent !== null);
        assert(intent.name === "intent_name");
        assert(intent.parameters !== null);
        assert(intent.parameters.name === "myname");
        assert(intent.parameters.age === 20);
    });
    
    
});



