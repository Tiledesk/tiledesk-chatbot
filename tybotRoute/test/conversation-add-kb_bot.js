const bot = {
   "webhook_enabled":false,
   "language":"en",
   "name":"Add Kb Chatbot",
   "slug":"add-kb-chatbot",
   "type":"tilebot",
   "subtype":"chatbot",
   "intents":[
      {
         "webhook_enabled":false,
         "enabled":true,
         "actions":[
            {
               "_tdActionTitle":"",
               "_tdActionId":"a9a8bd99-e4e1-416d-a6e8-85d925b56818",
               "_tdActionType":"add_kb_content",
               "type":"faq",
               "namespace":"63d540d370133e00128d6e59",
               "name":"this is the question",
               "source":"this is the answer",
               "content":"this is the question\nthis is the answer"
            }
         ],
         "intent_id":"b451f9a6-d597-40be-8b9f-fa0d40fdfc27",
         "intent_display_name":"addKbContent",
         "language":"en",
         "attributes":{
            "position":{
               "x":602,
               "y":98
            },
            "color":"156,163,205",
            "nextBlockAction":{
               "_tdActionTitle":"",
               "_tdActionId":"eeb58b18-7643-488e-ad45-0be2eee462ce",
               "_tdActionType":"intent"
            }
         },
         "agents_available":false
      },
      {
         "webhook_enabled":false,
         "enabled":true,
         "actions":[
            {
               "_tdActionType":"reply",
               "text":"I didn't understand. Can you rephrase your question?",
               "attributes":{
                  "commands":[
                     {
                        "type":"wait",
                        "time":500
                     },
                     {
                        "type":"message",
                        "message":{
                           "type":"text",
                           "text":"I didn't understand. Can you rephrase your question?"
                        }
                     }
                  ]
               }
            }
         ],
         "intent_id":"2815f164-8b5f-447e-8887-f273d1c24d6f",
         "intent_display_name":"defaultFallback",
         "language":"en",
         "attributes":{
            "position":{
               "x":714,
               "y":528
            }
         },
         "agents_available":false
      },
      {
         "webhook_enabled":false,
         "enabled":true,
         "actions":[
            {
               "_tdActionType":"intent",
               "intentName":"#b451f9a6-d597-40be-8b9f-fa0d40fdfc27",
               "_tdActionId":"818fbf6f5742453ebb5df81a078531e7"
            }
         ],
         "intent_id":"25b834b5-4fbb-4809-8876-895d066bf1bb",
         "question":"\\start",
         "intent_display_name":"start",
         "language":"en",
         "attributes":{
            "position":{
               "x":172,
               "y":384
            },
            "readonly":true,
            "color":"156,163,205",
            "nextBlockAction":{
               "_tdActionTitle":"",
               "_tdActionId":"08c37948-2206-4c9a-8b8f-63271243c68d",
               "_tdActionType":"intent"
            }
         },
         "agents_available":false
      }
   ]
}

// normalize the bot structure for the static intent search
let intents = bot.intents;
delete bot.intents;
let intents_dict_by_display_name = {};
for (let i = 0; i < intents.length; i++) {
	intents_dict_by_display_name[intents[i].intent_display_name] = intents[i];
}
let intents_dict_by_intent_id = {};
for (let i = 0; i < intents.length; i++) {
	intents_dict_by_intent_id[intents[i].intent_id] = intents[i];
}

bot.intents = intents_dict_by_display_name;
bot.intents_by_intent_id = intents_dict_by_intent_id
const bots_data = {
	"bots": {}
}
bots_data.bots["botID"] = bot;

module.exports = { bots_data: bots_data };