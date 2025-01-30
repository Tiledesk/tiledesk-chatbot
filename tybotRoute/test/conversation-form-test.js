var assert = require('assert');
let axios = require('axios');
const tybot = require("../index.js");
const tybotRoute = tybot.router;
var express = require('express');
var app = express();
app.use("/", tybotRoute);
app.use((err, req, res, next) => {
  console.error("General error", err);
});
require('dotenv').config();
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const bots_data = require('./conversation-form_bot.js').bots_data;

const PROJECT_ID = "projectID"; //const PROJECT_ID = process.env.TEST_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_BOT_ID;
const CHATBOT_TOKEN = process.env.CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil.js');
// // normalize the bot structure for the static intent search
// let intents = bot.intents;
// delete bot.intents;
// console.log ("bot still is", JSON.stringify(bot));
// console.log ("bintents still are", intents[0]);
// intent_dict = {};
// for (let i = 0; i < intents.length; i++) {
//   intent_dict[intents[i].intent_display_name] = intents[i];
// }
// bot.intents = intent_dict;
// const bots_data = {
//   "bots": {}
// }
// bots_data.bots[BOT_ID] = bot;
// console.log("bot:", bot);
// console.log("Testing conversation setup:");
// console.log("PROJECT_ID:", PROJECT_ID);
// console.log("REQUEST_ID:", REQUEST_ID);
// console.log("BOT_ID:", BOT_ID);

let app_listener;


describe('Conversation1 - Form filling', async () => {

  let util = new TiledeskChatbotUtil();

  before(() => {
    return new Promise(async (resolve, reject) => {
      console.log("Starting tilebot server...");
      tybot.startApp(
        {
          // MONGODB_URI: process.env.MONGODB_URI,
          bots: bots_data,
          API_ENDPOINT: process.env.API_ENDPOINT,
          REDIS_HOST: process.env.REDIS_HOST,
          REDIS_PORT: process.env.REDIS_PORT,
          REDIS_PASSWORD: process.env.REDIS_PASSWORD,
          log: process.env.TILEBOT_LOG
        }, () => {
          console.log("Tilebot route successfully started.");
          var port = process.env.PORT || 10001;
          app_listener = app.listen(port, () => {
            console.log('Tilebot connector listening on port ', port);
            resolve();
          });
        });
    })
  });

  after(function (done) {
    app_listener.close(() => {
      // console.log('CONVERSATION FORM app_listener closed.');
      done();
    });
  });

  it('/start', (done) => {
    // console.log("/start...ing Form story...");
    let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      // console.log(".....req.body:", JSON.stringify(req.body));
      res.send({ success: true });
      const message = req.body;
      assert(message.text === "Hello");
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 3);
      const command1 = message.attributes.commands[0];
      const command2 = message.attributes.commands[1];

      assert(command1.type === "message");
      assert(command1.message.text === "");
      assert(command1.message.type === "image");
      assert(command1.message.metadata.src !== null);

      assert(command2.type === "wait");
      assert(command2.time === 500);


      util.getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          // console.log("params /start:", params);
          assert(params);
          assert(params["last_message_id"] === message_id);
          assert(params["project_id"] === PROJECT_ID);
          listener.close(() => {
            done();
          });
        }
      });

    });

    listener = endpointServer.listen(10002, '0.0.0.0', function () {
      //console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "_id": message_id,
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/start",
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
        //console.log("Message sent.");
      });
    });
  });

  // it('/disable_input', (done) => {
  //   // console.log("/disable_input...");
  //   let listener;
  //   let endpointServer = express();
  //   endpointServer.use(bodyParser.json());
  //   endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
  //     // console.log("req.body....:", JSON.stringify(req.body));
  //     res.send({ success: true });
  //     const message = req.body;

  //     assert(message["text"] !== "");
  //     assert(message["attributes"] !== "");
  //     assert(message["attributes"]["disableInputMessage"] === true);

  //     listener.close(() => {
  //       // console.log('closed.');
  //       done();
  //     });

  //   });

  //   listener = endpointServer.listen(10002, '0.0.0.0', function () {
  //     // console.log('endpointServer started', listener.address());
  //     // const botId = process.env.TEST_BOT_ID;
  //     // const PROJECT_ID = process.env.TEST_PROJECT_ID;
  //     // console.log("botId:", botId);
  //     // console.log("REQUEST_ID:", REQUEST_ID);
  //     let request = {
  //       "payload": {
  //         "_id": uuidv4(),
  //         "senderFullname": "guest#367e",
  //         "type": "text",
  //         "sender": "A-SENDER",
  //         "recipient": REQUEST_ID,
  //         "text": "/disable_input",
  //         "id_project": PROJECT_ID,
  //         "metadata": "",
  //         "request": {
  //           "request_id": REQUEST_ID,
  //           "id_project": PROJECT_ID
  //         }
  //       },
  //       "token": CHATBOT_TOKEN
  //     }
  //     sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
  //       // console.log("Message sent.");
  //     });
  //   });
  // });

  it('/good_form', (done) => {
    // console.log("/good_form...");
    const message_id = uuidv4();
    const reply_text = "Andrea";
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      // console.log("req.body22222:", JSON.stringify(req.body));
      res.send({ success: true });
      const message = req.body;

      if (message.text === "Your name?") {
        let request = {
          "payload": {
            "_id": message_id,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": reply_text,
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("Message sent.", request);
        });
      }
      else if (message.text === "It's a good form Andrea") {
        // verify parameters
        util.getChatbotParameters(REQUEST_ID, (err, params) => {
          if (err) {
            assert.ok(false);
          }
          else {
            // console.log("params2:", params);
            assert(params);
            assert(params["last_message_id"] === message_id);
          assert(params["project_id"] === PROJECT_ID);
            assert(params["your_fullname"] === reply_text);
            assert(params["_tdTypeOf:your_fullname"]);
            listener.close(() => {
              // console.log("done2");
              done();
            });
          }
        });

      }
      else {
        console.error("Unexpected message2.");
        assert.ok(false);
      }

    });

    listener = endpointServer.listen(10002, '0.0.0.0', function () {
      // console.log('endpointServer started', listener.address());
      // console.log("REQUEST_ID:", REQUEST_ID);
      let request = {
        "payload": {
          "_id": uuidv4(),
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/good_form",
          "id_project": PROJECT_ID,
          "request": {
            "request_id": REQUEST_ID,
            // "id_project": PROJECT_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
        // console.log("Message sent.");
      });
    });
  });

  it('(intent-to-intent) /move_to => /target_intent', (done) => {
    // console.log("ALWAYS PASSES: (intent-to-intent) /move_to => /target_intent");
    try {
      let listener;
      let endpointServer = express();
      endpointServer.use(bodyParser.json());
      endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
        res.send({ success: true });
        const message = req.body;
        // console.log("received message33:", JSON.stringify(message));
        if (message.text === "The target!") {
          // console.log("Got it. End.");
          listener.close(() => {
            done();
          });
        }
      });
  
      listener = endpointServer.listen(10002, '0.0.0.0', function () {
        // console.log('endpointServer started', listener.address());
        // console.log("REQUEST_ID:", REQUEST_ID);
        let request = {
          "payload": {
            "_id": uuidv4(),
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/move_to",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        // console.log("sending message:", request);
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("Message sent33.");
        });
      });
    }
    catch(error) {
      console.error("Error:", error);
      done()
    }
  });

  it('/all_filled (none) => /form_to_unfill => (fill) => /all_filled (all) /form_to_unfill (bypass because filled) => /delete_fullname => all_filled (no fullname) => /form_to_unfill (verify it asks only for fullname) => all_filled (all, again)', (done) => {
    // console.log("SOMETIMES NOT PASSING: /all_filled (none) =>...");
    let request0_uuid = uuidv4();
    let request1_uuid = uuidv4();
    let request2_uuid = uuidv4();
    let request3_uuid = uuidv4();
    let request4_uuid = uuidv4();
    let request5_uuid = uuidv4();
    let request6_uuid = uuidv4();
    let request7_uuid = uuidv4();
    let request8_uuid = uuidv4();
    let request9_uuid = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      // console.log("received message__3:", JSON.stringify(message));
      // console.log("message.triggeredByMessageId:", message.triggeredByMessageId);
      // console.log("message.text:", message.text);
      
      if (message.text === "You filled\nfullname: ${fullname}\nyouremail: ${youremail}" && message.triggeredByMessageId === request0_uuid) {
        // console.log("got #0 'You filled...' sending #1");
        let request = {
          "payload": {
            "_id": request1_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/form_to_unfill",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("Message sent.", request);
        });
      }
      else if (message.text === "Your name?" && message.triggeredByMessageId === request1_uuid) {
        // console.log("got #1 sending #2");
        let request = {
          "payload": {
            "_id": request2_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "Andrea",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("Message sent4.", request);
        });
        // listener.close( () => {
        //   done();
        // });
      }
      else if (message.text === "Your email?" && message.triggeredByMessageId === request2_uuid) {
        // console.log("got #2 sending #3");
        let request = {
          "payload": {
            "_id": request3_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "test@test.it",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("Message sent5.", request);
        });
        // listener.close( () => {
        //   done();
        // });
      }
      else if (message.text === "Thanks Andrea\nYour email test@test.it" && message.triggeredByMessageId === request3_uuid) {
        // console.log("got #3 sending #4");
        let request = {
          "payload": {
            "_id": request4_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/all_filled",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("got #3 sending #4. Message sent.", request);
        });
        // listener.close( () => {
        //   done();
        // });
      }
      else if (message.text === "You filled\nfullname: Andrea\nyouremail: test@test.it" && message.triggeredByMessageId === request4_uuid) {
        // console.log("got #4 sending #5");
        let request = {
          "payload": {
            "_id": request5_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/form_to_unfill",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("got #4 sending #5. Message sent.", request);
        });
        // listener.close( () => {
        //   done();
        // });
      }
      else if (message.text === "Thanks Andrea\nYour email test@test.it" && message.triggeredByMessageId === request5_uuid) {
        // console.log("got #5 sending #6");
        let request = {
          "payload": {
            "_id": request6_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/delete_fullname",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("got #5 sending #6. Message sent.", request);
        });
        // listener.close( () => {
        //   done();
        // });
      }
      else if (message.text === "deleting fullname..." && message.triggeredByMessageId === request6_uuid) {
        // console.log("got #6 sending #7");
        let request = {
          "payload": {
            "_id": request7_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/form_to_unfill",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("got #6 sending #7. Message sent.", request);
        });
        // listener.close( () => {
        //   done();
        // });
      }
      else if (message.text === "Your name?" && message.triggeredByMessageId === request7_uuid) {
        // console.log("got #7 sending #8");
        let request = {
          "payload": {
            "_id": request8_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "John",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("got #7 sending #8. Message sent.", request);
        });
        // listener.close( () => {
        //   done();
        // });
      }
      else if (message.text === "Thanks John\nYour email test@test.it" && message.triggeredByMessageId === request8_uuid) {
        // console.log("got #8 sending #9");
        let request = { // intent-to-intent connection
          "payload": {
            "_id": request9_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/delete_all",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("got #8 sending #9. Message sent.", request);
        });
      }
      else if (message.text === "You filled\nfullname: ${fullname}\nyouremail: ${youremail}") {
        // console.log("got #9. End.");
        listener.close(() => {
          done();
        });
      }
      // else {
      //   console.error("Unexpected message.");
      //   console.log("message.triggeredByMessageId", message.triggeredByMessageId)
      //   console.log("request1_uuid", request1_uuid)
      //   assert.ok(false);
      // }

    });

    listener = endpointServer.listen(10002, '0.0.0.0', function () {
      // console.log('endpointServer started', listener.address());
      // console.log("REQUEST_ID:", REQUEST_ID);
      let request = {
        "payload": {
          "_id": request0_uuid,
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/all_filled",
          "id_project": PROJECT_ID,
          "request": {
            "request_id": REQUEST_ID,
            // "id_project": PROJECT_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      // console.log("sending message:", request);
      sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
        // console.log("Message sent.");
      });
    });
  });

  it('/splitted', (done) => {
    console.log("/splitted...");
    // const message_id = uuidv4();
    // const reply_text = "Andrea";
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      // console.log("req.body:", JSON.stringify(req.body));
      res.send({ success: true });
      const message = req.body;
      // console.log("message:", JSON.stringify(message));
      if (message.attributes.commands) {
        assert(message.attributes.commands.length === 5);
        assert(message.attributes.commands[0].type === "message");
        assert(message.attributes.commands[0].message.text === "Row1");
        assert(message.attributes.commands[0].message.type === "text");

        assert(message.attributes.commands[1].type === "wait");
        assert(message.attributes.commands[1].time === 500);

        assert(message.attributes.commands[2].type === "message");
        assert(message.attributes.commands[2].message.text === "Row2");
        assert(message.attributes.commands[2].message.type === "image");
        assert(message.attributes.commands[2].message.metadata);

        assert(message.attributes.commands[3].type === "wait");
        assert(message.attributes.commands[3].time === 500);

        assert(message.attributes.commands[4].type === "message");
        assert(message.attributes.commands[4].message.text === "Row4");
        assert(message.attributes.commands[4].message.type === "text");
        assert(message.attributes.commands[4].message.attributes);
        assert(message.attributes.commands[4].message.attributes.attachment);
        assert(message.attributes.commands[4].message.attributes.attachment.type === 'template');
        assert(message.attributes.commands[4].message.attributes.attachment.buttons.length === 1);
        assert(message.attributes.commands[4].message.attributes.attachment.buttons[0].type === 'text');
        assert(message.attributes.commands[4].message.attributes.attachment.buttons[0].value === '/start');

        const expected_raw_message = 'Row1\n' +
          '\n' +
          'Row2\n' +
          'tdImage:https://nypost.com/wp-content/uploads/sites/2/2020/03/covid-tiger-01.jpg?quality=75&strip=all&w=1488\n' +
          '\n' +
          'Row4\n' +
          '* /start';
        assert(message.attributes._raw_message === expected_raw_message);
        listener.close(() => {
          done();
        });
      }
      else {
        console.error("Unexpected message.");
        assert.ok(false);
      }

    });

    listener = endpointServer.listen(10002, '0.0.0.0', function () {
      // console.log('endpointServer started', listener.address());
      // console.log("REQUEST_ID:", REQUEST_ID);
      let request = {
        "payload": {
          "_id": uuidv4(),
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/splitted",
          "id_project": PROJECT_ID,
          "request": {
            "request_id": REQUEST_ID,
            // "id_project": PROJECT_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
        // console.log("Message sent.");
      });
    });
  });

  it('/assign_params{...}', (done) => {
    console.log("/assign_params...");
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      if (message.text) {
        assert(message.text === "myvar: places");
        util.getChatbotParameters(REQUEST_ID, (err, params) => {
          if (err) {
            assert.ok(false);
          }
          else {
            // console.log("params /assign_params:", params);
            assert(params);
            assert(params["variableName"] === "places");
            assert(params["myvar"] === "places");
            listener.close(() => {
              done();
            });
          }
        });
      }
      else {
        console.error("Unexpected message.");
        assert.ok(false);
      }
    });
    listener = endpointServer.listen(10002, '0.0.0.0', function () {
      let request = {
        "payload": {
          "_id": uuidv4(),
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/assign_params{\"variableName\": \"places\"}",
          "id_project": PROJECT_ID,
          "request": {
            "request_id": REQUEST_ID,
            // "id_project": PROJECT_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
        // console.log("Message sent.", request);
      });
    });
  });

  it('/assign_params{...} with multi-line JSON', (done) => {
    console.log("/assign_params{...} with multi-line JSON");
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      if (message.text) {
        assert(message.text === "myvar: places");
        util.getChatbotParameters(REQUEST_ID, (err, params) => {
          if (err) {
            assert.ok(false);
          }
          else {
            // console.log("params /assign_params:", params);
            assert(params);
            assert(params["var1"] === "value1");
            assert(params["var2"] === "value2");
            listener.close(() => {
              done();
            });
          }
        });
      }
      else {
        console.error("Unexpected message.");
        assert.ok(false);
      }
    });
    listener = endpointServer.listen(10002, '0.0.0.0', function () {
      let request = {
        "payload": {
          "_id": uuidv4(),
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": `/assign_params{
              "var1": "value1",
              "var2": "value2"
          }`,
          "id_project": PROJECT_ID,
          "request": {
            "request_id": REQUEST_ID,
            // "id_project": PROJECT_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
        // console.log("Message sent.", request);
      });
    });
  });

//   it('/if_you_live_IT (_tdCondition) TRUE', (done) => {
//     console.log("/if_you_live_IT (TRUE)...");
//     let listener;
//     let endpointServer = express();
//     endpointServer.use(bodyParser.json());
//     endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
//       // console.log("req.body:", JSON.stringify(req.body));
//       res.send({ success: true });
//       const message = req.body;
//       // console.log("message:", JSON.stringify(message));
//       if (message.text.startsWith("myvar:")) {
//         assert(message.text !== null);
//         getChatbotParameters(REQUEST_ID, (err, params) => {
//           if (err) {
//             assert.ok(false);
//           }
//           else {
//             // console.log("params /condition:", params);
//             assert(params);
//             // assert(params["city"] === "Milan");
//             assert(params["tdCountry"] === "IT");
//             let request = {
//               "payload": {
//                 "_id": uuidv4(),
//                 "senderFullname": "guest#367e",
//                 "type": "text",
//                 "sender": "A-SENDER",
//                 "recipient": REQUEST_ID,
//                 "text": "/if_you_live_IT",
//                 "id_project": PROJECT_ID,
//                 "request": {
//                   "request_id": REQUEST_ID,
//                   // "id_project": PROJECT_ID
//                 }
//               },
//               "token": CHATBOT_TOKEN
//             }
//             sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
//               // console.log("Message sent.", request);
//             });
//           }
//         });
//       }
//       else if (message.attributes && message.attributes.commands[0].message.text === "You live in Italy! Wow") {
//         listener.close(() => {
//           done();
//         });
//       }
//       else {
//         console.error("Unexpected message.");
//         assert.ok(false);
//       }
//     });
//     listener = endpointServer.listen(10002, '0.0.0.0', function () {
//       let request = {
//         "payload": {
//           "_id": uuidv4(),
//           "senderFullname": "guest#367e",
//           "type": "text",
//           "sender": "A-SENDER",
//           "recipient": REQUEST_ID,
//           "text": "/assign_params{\"tdCountry\": \"IT\"}",
//           "id_project": PROJECT_ID,
//           "request": {
//             "request_id": REQUEST_ID,
//             // "id_project": PROJECT_ID
//           }
//         },
//         "token": CHATBOT_TOKEN
//       }
//       sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
//         // console.log("Message sent.", request);
//       });
//     });
//   });

//   it('/if_you_live_IT (_tdCondition) FALSE', (done) => {
//     // console.log("/if_you_live_IT (FALSE)...");
//     let listener;
//     let endpointServer = express();
//     endpointServer.use(bodyParser.json());
//     endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
//       // console.log("req.body:", JSON.stringify(req.body));
//       res.send({ success: true });
//       const message = req.body;
//       // console.log("message:", JSON.stringify(message));
//       if (message.text.startsWith("myvar:")) {
//         assert(message.text !== null);
//         getChatbotParameters(REQUEST_ID, (err, params) => {
//           if (err) {
//             assert.ok(false);
//           }
//           else {
//             // console.log("params /if_you_live_IT:", params);
//             assert(params);
//             // assert(params["city"] === "Milan");
//             assert(params["tdCountry"] === "US");
//             let request = {
//               "payload": {
//                 "_id": uuidv4(),
//                 "senderFullname": "guest#367e",
//                 "type": "text",
//                 "sender": "A-SENDER",
//                 "recipient": REQUEST_ID,
//                 "text": "/if_you_live_IT",
//                 "id_project": PROJECT_ID,
//                 "request": {
//                   "request_id": REQUEST_ID,
//                   // "id_project": PROJECT_ID
//                 }
//               },
//               "token": CHATBOT_TOKEN
//             }
//             sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
//               // console.log("Message sent.", request);
//             });
//           }
//         });
//       }
//       else if (message.text === "You don't live in Italy!") {
//         listener.close(() => {
//           done();
//         });
//       }
//       else {
//         console.error("Unexpected message.");
//         assert.ok(false);
//       }
//     });
//     listener = endpointServer.listen(10002, '0.0.0.0', function () {
//       let request = {
//         "payload": {
//           "_id": uuidv4(),
//           "senderFullname": "guest#367e",
//           "type": "text",
//           "sender": "A-SENDER",
//           "recipient": REQUEST_ID,
//           "text": "/assign_params{\"tdCountry\": \"US\"}",
//           "id_project": PROJECT_ID,
//           "request": {
//             "request_id": REQUEST_ID,
//             // "id_project": PROJECT_ID
//           }
//         },
//         "token": CHATBOT_TOKEN
//       }
//       sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
//         // console.log("Message sent.", request);
//       });
//     });
//   });

});

// function createRequest(projectId, callback) {

//   const tdclient = new TiledeskClient({
//     APIKEY: "___",
//     APIURL: "",
//     projectId: projectId,
//     token: ANONYM_USER_TOKEN,
//     log: false
// });
// if (tdclient) {
//     assert(tdclient != null);
//     const text_value = 'test message';
//     const request_id = TiledeskClient.newRequestId(PROJECT_ID);
//     tdclient.sendSupportMessage(request_id, {text: text_value}, function(err, result) {
//         assert(err === null);
//         assert(result != null);
//         assert(result.text === text_value);
//         done();
//     });
// }
// else {
//     assert.ok(false);
// }
// }

// function createAnonyUser(projecId, callback) {
//   TiledeskClient.anonymousAuthentication(
//     projecId,
//     "_",
//     {
//         APIURL: API_ENDPOINT,
//         log: false
//     },
//     function(err, result) {
//         if (!err && result) {
//             callback(result.token)
//         }
//         else {
//           callback(null);
//         }
//     }
//   );
// }

/**
 * A stub to send message to the "ext/botId" endpoint, hosted by tilebot on:
 * /${TILEBOT_ROUTE}/ext/${botId}
 *
 * @param {Object} message. The message to send
 * @param {string} botId. Tiledesk botId
 * @param {string} token. User token
 */
function sendMessageToBot(message, botId, token, callback) {
  // const jwt_token = this.fixToken(token);
  const url = `${process.env.TILEBOT_ENDPOINT}/ext/${botId}`;
  // console.log("sendMessageToBot URL", url);
  const HTTPREQUEST = {
    url: url,
    headers: {
      'Content-Type': 'application/json'
    },
    json: message,
    method: 'POST'
  };
  myrequest(
    HTTPREQUEST,
    function (err, resbody) {
      if (err) {
        if (callback) {
          callback(err);
        }
      }
      else {
        if (callback) {
          callback(null, resbody);
        }
      }
    }, false
  );
}

/**
 * A stub to get the request parameters, hosted by tilebot on:
 * /${TILEBOT_ROUTE}/ext/parameters/requests/${requestId}?all
 *
 * @param {string} requestId. Tiledesk chatbot/requestId parameters
 */
// function getChatbotParameters(requestId, callback) {
//   // const jwt_token = this.fixToken(token);
//   const url = `${process.env.TILEBOT_ENDPOINT}/ext/parameters/requests/${requestId}?all`;
//   const HTTPREQUEST = {
//     url: url,
//     headers: {
//       'Content-Type': 'application/json'
//     },
//     method: 'get'
//   };
//   myrequest(
//     HTTPREQUEST,
//     function (err, resbody) {
//       if (err) {
//         if (callback) {
//           callback(err);
//         }
//       }
//       else {
//         if (callback) {
//           callback(null, resbody);
//         }
//       }
//     }, false
//   );
// }

function myrequest(options, callback, log) {
  if (log) {
    console.log("API URL:", options.url);
    console.log("** Options:", JSON.stringify(options));
  }
  axios(
    {
      url: options.url,
      method: options.method,
      data: options.json,
      params: options.params,
      headers: options.headers
    })
    .then((res) => {
      if (log) {
        console.log("Response for url:", options.url);
        console.log("Response headers:\n", JSON.stringify(res.headers));
        //console.log("******** Response for url:", res);
      }
      if (res && res.status == 200 && res.data) {
        if (callback) {
          callback(null, res.data);
        }
      }
      else {
        if (callback) {
          callback(TiledeskClient.getErr({ message: "Response status not 200" }, options, res), null, null);
        }
      }
    })
    .catch((error) => {
      console.error("An error occurred:", error);
      if (callback) {
        callback(error, null, null);
      }
    });
}
