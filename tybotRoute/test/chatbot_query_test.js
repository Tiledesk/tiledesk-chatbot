var assert = require('assert');
const { TiledeskChatbot } = require('../models/TiledeskChatbot_Intents_Adapter.js');
const { StaticIntentsDataSource } = require('../models/StaticIntentsDataSource.js');

const testIntentsDataSource = {
    "intents": {
      "intent1": {
        intent_display_name: "intent1",
        questions: [
          "intent1 question1",
          "intent1 question2"
        ],
        answer: "reply to intent1"
      },
      "intent2": {
        intent_display_name: "intent1",
        questions: [
          "intent2 question1",
          "intent2 question2"
        ],
        answer: "reply to intent2"
      },
      "intent3": {
        intent_display_name: "intent3",
        questions: [
          "intent3 question1",
          "intent3 question2"
        ],
        answer: "reply to intent3"
      }
    },
    "questions_intent": {
    
      "intent1 question1": "intent1",
      "intent1 question2": "intent1",
      
      "intent2 question1": "intent2",
      "intent2 question2": "intent2",
    
      "intent3 question1": "intent3",
      "intent3 question2": "intent3"
    },
    "intents_nlp" : {
        "query1": {
            "name": "intent1"
        },
        "query2": {
            "name": "intent2"
        }
    }
}

describe('Basic replyToMessage()', function() {
   
    it('create the chatbot object', () => {
        const chatbot = new TiledeskChatbot({
            intentsDataSource: {},
            intentsFinder: {},
            bot: {},
            token: "token",
            APIURL: "APIURL",
            APIKEY: "___",
            tdcache: null,
            requestId: "requestId",
            projectId: "projectId",
            log: false
        });
        
        assert(chatbot != null);
    });

    it('query intent action', async () => {

        const intentsDataSource = new StaticIntentsDataSource(testIntentsDataSource);
        const bot = {
            webhook_enabled: false,
            _id: '634bff36fbc427001ad1c54e',
            name: 'test bot',
            id_project: 'project',
          }
        const chatbot = new TiledeskChatbot({
            intentsDataSource: intentsDataSource,
            intentsFinder: intentsDataSource,
            bot: bot,
            token: "token",
            APIURL: "APIURL",
            APIKEY: "___",
            tdcache: null,
            requestId: "requestId",
            projectId: "projectId",
            log: true
        });
        assert(chatbot != null);

        const message = {
            text: "not important",
            attributes: {
                action: "intent1"
            },
            request: {
                request_id: "requestId"
            }
        }
        const reply = await chatbot.replyToMessage(message);
        console.log("reply:", reply);
        assert(reply);
        assert(reply.text === testIntentsDataSource.intents.intent1.answer);
    });

    it('query exact match', async () => {

        const intentsDataSource = new StaticIntentsDataSource(testIntentsDataSource);
        const bot = {
            webhook_enabled: false,
            _id: '634bff36fbc427001ad1c54e',
            name: 'test bot',
            id_project: 'project',
          }
        const chatbot = new TiledeskChatbot({
            intentsDataSource: intentsDataSource,
            intentsFinder: intentsDataSource,
            bot: bot,
            token: "token",
            APIURL: "APIURL",
            APIKEY: "___",
            tdcache: null,
            requestId: "requestId",
            projectId: "projectId",
            log: true
        });
        assert(chatbot != null);

        const message = {
            text: "intent1 question1",
            request: {
                request_id: "requestId"
            }
        }
        const reply = await chatbot.replyToMessage(message);
        console.log("reply:", reply);
        assert(reply);
        assert(reply.text === testIntentsDataSource.intents.intent1.intent_display_name);
    });

});



