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
    "id_project": "63a075485f117f0013541e32",
    "trashed": false,
    "createdBy": "63a05d755f117f0013541383",
    "createdAt": "2022-12-19T14:29:51.740Z",
    "updatedAt": "2022-12-31T11:16:07.719Z",
    "__v": 0,
    "url": "http://localhost:3000/modules/tilebot/ext/63a0755f5f117f0013541eee",
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
    "description": "nuovo bot per lead generation sul sito di tiledesk",
    "id_project": "63a075485f117f0013541e32",
    "trashed": false,
    "createdBy": "639885dbec6850001a525e8b",
    "createdAt": "2022-12-23T14:53:17.524Z",
    "updatedAt": "2022-12-23T14:53:17.533Z",
    "__v": 0,
    "url": "http://localhost:3000/modules/tilebot/ext/63a5c0ddb044210013b24e6a"
}, {
    "webhook_enabled": false,
    "type": "tilebot",
    "language": "en",
    "public": false,
    "certified": false,
    "intentsEngine": "none",
    "_id": "63ac2cacb044210013b93029",
    "name": "Ty",
    "description": "New Ty in ENG\n#langbot-pivot",
    "id_project": "63a075485f117f0013541e32",
    "trashed": false,
    "createdBy": "63a070c75f117f0013541aa1",
    "createdAt": "2022-12-28T11:46:52.757Z",
    "updatedAt": "2022-12-31T11:16:28.437Z",
    "__v": 0,
    "url": "http://localhost:3000/modules/tilebot/ext/63ac2cacb044210013b93029"
}, {
    "webhook_enabled": true,
    "type": "tilebot",
    "language": "en",
    "public": false,
    "certified": false,
    "intentsEngine": "none",
    "_id": "63b019de262d1d001a3951ae",
    "name": "_tdLanguageChooser",
    "description": "_tdLanguageChooser\n#langbot-ignore",
    "id_project": "63a075485f117f0013541e32",
    "webhook_url": "https://chatbot-templates.herokuapp.com/langbot/lang_select",
    "trashed": false,
    "createdBy": "63a05d755f117f0013541383",
    "createdAt": "2022-12-31T11:15:42.585Z",
    "updatedAt": "2022-12-31T11:15:42.598Z",
    "__v": 0,
    "url": "http://localhost:3000/modules/tilebot/ext/63b019de262d1d001a3951ae"
}, {
    "webhook_enabled": false,
    "type": "tilebot",
    "language": "en",
    "public": false,
    "certified": false,
    "intentsEngine": "none",
    "_id": "63b3f600d80818001a4f763f",
    "name": "Dean for Quick Replies",
    "description": "This chatbot can recognize customers' purpose, context, and content. Then Providing some buttons as quick replies",
    "id_project": "63a075485f117f0013541e32",
    "mainCategory": "Customer Satisfaction",
    "trashed": false,
    "createdBy": "63a070c75f117f0013541aa1",
    "createdAt": "2023-01-03T09:31:44.905Z",
    "updatedAt": "2023-01-03T09:31:44.912Z",
    "__v": 0,
    "url": "http://localhost:3000/modules/tilebot/ext/63b3f600d80818001a4f763f"
}, {
    "webhook_enabled": false,
    "type": "tilebot",
    "language": "en",
    "public": false,
    "certified": false,
    "intentsEngine": "none",
    "_id": "63b708a82ef2e4001a5de755",
    "name": "Ty: The Helper 🛠️ ",
    "id_project": "63a075485f117f0013541e32",
    "trashed": false,
    "createdBy": "639885dbec6850001a525e8b",
    "createdAt": "2023-01-05T17:28:08.756Z",
    "updatedAt": "2023-01-05T17:30:45.229Z",
    "__v": 0,
    "url": "http://localhost:3000/modules/tilebot/ext/63b708a82ef2e4001a5de755"
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



