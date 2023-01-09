var assert = require('assert');
const { LanguageChooser } = require('../LanguageChooser');

const BOTS = [{
    "webhook_enabled": false,
    "type": "tilebot",
    "language": "en",
    "public": false,
    "certified": false,
    "intentsEngine": "none",
    "_id": "63a0755f5f117f0013541eee",
    "name": "Tybot",
    "description": "#langbot-ignore"
}, {
    "webhook_enabled": false,
    "type": "tilebot",
    "language": "it",
    "public": false,
    "certified": false,
    "intentsEngine": "none",
    "_id": "63a5c0ddb044210013b24e6a",
    "name": "Ty in Italiano",
    "description": "nuovo bot per lead generation sul sito di tiledesk"
}, {
    "webhook_enabled": false,
    "type": "tilebot",
    "language": "en",
    "public": false,
    "certified": false,
    "intentsEngine": "none",
    "_id": "63ac2cacb044210013b93029",
    "name": "Ty",
    "description": "New Ty in ENG\n#langbot-pivot"
}, {
    "webhook_enabled": true,
    "type": "tilebot",
    "language": "en",
    "public": false,
    "certified": false,
    "intentsEngine": "none",
    "_id": "63b019de262d1d001a3951ae",
    "name": "_tdLanguageChooser",
    "description": "_tdLanguageChooser\n#langbot-ignore"
}, {
    "webhook_enabled": false,
    "type": "tilebot",
    "language": "en",
    "public": false,
    "certified": false,
    "intentsEngine": "none",
    "_id": "63b3f600d80818001a4f763f",
    "name": "Dean for Quick Replies",
    "description": "This chatbot can recognize customers' purpose, context, and content. Then Providing some buttons as quick replies"
}, {
    "webhook_enabled": false,
    "type": "tilebot",
    "language": "en",
    "public": false,
    "certified": false,
    "intentsEngine": "none",
    "_id": "63b708a82ef2e4001a5de755",
    "name": "Ty: The Helper 🛠️ "
}];

describe('chooser', function() {
  
    it('user "Da" language with no "Da" support and "Ty" as pivot', async () => {
        chooser = new LanguageChooser();
        const lang_iso = "da"
        const bot = chooser.findIn(BOTS, lang_iso);        
        assert(bot !== null);
        assert(bot.name === "Ty")
    });

    it('user "en" language with "en" support', async () => {
        chooser = new LanguageChooser();
        const lang_iso = "en"
        const bot = chooser.findIn(BOTS, lang_iso);        
        assert(bot !== null);
        assert(bot.name === "Ty")
    });

    it('user "it" language with "it" support', async () => {
        chooser = new LanguageChooser();
        const lang_iso = "it"
        const bot = chooser.findIn(BOTS, lang_iso);    
        console.log("bot:", bot)    
        assert(bot !== null);
        assert(bot.name === "Ty in Italiano");
    });

    it('user "" language => pivot', async () => {
        chooser = new LanguageChooser();
        const lang_iso = ""
        const bot = chooser.findIn(BOTS, lang_iso);
        console.log("bot:", bot)    
        assert(bot !== null);
        assert(bot.name === "Ty");
    });

    it('user "null" language => pivot', async () => {
        chooser = new LanguageChooser();
        const lang_iso = null;
        const bot = chooser.findIn(BOTS, lang_iso);
        console.log("bot:", bot)    
        assert(bot !== null);
        assert(bot.name === "Ty");
    });
    
});



