var assert = require('assert');
let axios = require('axios');
const tybot = require("../index.js");
const tybotRoute = tybot.router;
var express = require('express');
var app = express();
const winston = require('../utils/winston');
app.use("/", tybotRoute);
app.use((err, req, res, next) => {
  winston.error("General error", err);
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

let app_listener;


describe('Conversation1 - Form filling', async () => {

  let util = new TiledeskChatbotUtil();

  before(() => {
    return new Promise(async (resolve, reject) => {
      winston.info("Starting tilebot server...");
      tybot.startApp(
        {
          // MONGODB_URI: process.env.MONGODB_URI,
          bots: bots_data,
          TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
          API_ENDPOINT: process.env.API_ENDPOINT,
          REDIS_HOST: process.env.REDIS_HOST,
          REDIS_PORT: process.env.REDIS_PORT,
          REDIS_PASSWORD: process.env.REDIS_PASSWORD,
          log: process.env.TILEBOT_LOG
        }, () => {
          winston.info("Tilebot route successfully started.");
          var port = process.env.PORT || 10001;
          app_listener = app.listen(port, () => {
            winston.info('Tilebot connector listening on port ' + port);
            resolve();
          });
        });
    })
  });

  after(function (done) {
    app_listener.close(() => {
      done();
    });
  });

  it('/start', (done) => {
    let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
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
      winston.verbose('endpointServer started' + listener.address());
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
        winston.verbose("Message sent.");
      });
    });
  });

  // it('/disable_input', (done) => {
  //   let listener;
  //   let endpointServer = express();
  //   endpointServer.use(bodyParser.json());
  //   endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
  //     res.send({ success: true });
  //     const message = req.body;

  //     assert(message["text"] !== "");
  //     assert(message["attributes"] !== "");
  //     assert(message["attributes"]["disableInputMessage"] === true);

  //     listener.close(() => {
  //       done();
  //     });

  //   });

  //   listener = endpointServer.listen(10002, '0.0.0.0', function () {
  //     winston.verbose('endpointServer started' + listener.address());
  //     // const botId = process.env.TEST_BOT_ID;
  //     // const PROJECT_ID = process.env.TEST_PROJECT_ID;
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
  //       winston.verbose("Message sent.");
  //     });
  //   });
  // });

  it('/good_form', (done) => {
    const message_id = uuidv4();
    const reply_text = "Andrea";
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
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
          winston.verbose("Message sent.", request);
        });
      }
      else if (message.text === "It's a good form Andrea") {
        // verify parameters
        util.getChatbotParameters(REQUEST_ID, (err, params) => {
          if (err) {
            assert.ok(false);
          }
          else {
            assert(params);
            assert(params["last_message_id"] === message_id);
          assert(params["project_id"] === PROJECT_ID);
            assert(params["your_fullname"] === reply_text);
            assert(params["_tdTypeOf:your_fullname"]);
            listener.close(() => {
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
      winston.verbose('endpointServer started' + listener.address());
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
        winston.verbose("Message sent.");
      });
    });
  });

  it('(intent-to-intent) /move_to => /target_intent', (done) => {
    try {
      let listener;
      let endpointServer = express();
      endpointServer.use(bodyParser.json());
      endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
        res.send({ success: true });
        const message = req.body;
        if (message.text === "The target!") {
          listener.close(() => {
            done();
          });
        }
      });
  
      listener = endpointServer.listen(10002, '0.0.0.0', function () {
        winston.verbose('endpointServer started' + listener.address());
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
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
        });
      });
    }
    catch(error) {
      console.error("Error:", error);
      done()
    }
  });

  it('/all_filled (none) => /form_to_unfill => (fill) => /all_filled (all) /form_to_unfill (bypass because filled) => /delete_fullname => all_filled (no fullname) => /form_to_unfill (verify it asks only for fullname) => all_filled (all, again)', (done) => {
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
      
      if (message.text === "You filled\nfullname: ${fullname}\nyouremail: ${youremail}" && message.triggeredByMessageId === request0_uuid) {
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
          winston.verbose("Message sent.", request);
        });
      }
      else if (message.text === "Your name?" && message.triggeredByMessageId === request1_uuid) {
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
          winston.verbose("Message sent ", request);
        });
      }
      else if (message.text === "Your email?" && message.triggeredByMessageId === request2_uuid) {
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
          winston.verbose("Message sent ", request);
        });
      }
      else if (message.text === "Thanks Andrea\nYour email test@test.it" && message.triggeredByMessageId === request3_uuid) {
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
          winston.verbose("Message sent ", request);
        });
        // listener.close( () => {
        //   done();
        // });
      }
      else if (message.text === "You filled\nfullname: Andrea\nyouremail: test@test.it" && message.triggeredByMessageId === request4_uuid) {
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
          winston.verbose("Message sent ", request);
        });
      }
      else if (message.text === "Thanks Andrea\nYour email test@test.it" && message.triggeredByMessageId === request5_uuid) {
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
          winston.verbose("Message sent ", request);
        });
      }
      else if (message.text === "deleting fullname..." && message.triggeredByMessageId === request6_uuid) {
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
          winston.verbose("Message sent ", request);
        });
      }
      else if (message.text === "Your name?" && message.triggeredByMessageId === request7_uuid) {
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
          winston.verbose("Message sent ", request);
        });
      }
      else if (message.text === "Thanks John\nYour email test@test.it" && message.triggeredByMessageId === request8_uuid) {
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
          winston.verbose("Message sent ", request);
        });
      }
      else if (message.text === "You filled\nfullname: ${fullname}\nyouremail: ${youremail}") {
        listener.close(() => {
          done();
        });
      }

    });

    listener = endpointServer.listen(10002, '0.0.0.0', function () {
      winston.verbose('endpointServer started' + listener.address());
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
      sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
        winston.verbose("Message sent.");
      });
    });
  });

  it('/splitted', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
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
      winston.verbose('endpointServer started' + listener.address());
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
        winston.verbose("Message sent.");
      });
    });
  });

  it('/assign_params{...}', (done) => {
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
        winston.verbose("Message sent.", request);
      });
    });
  });

  it('/assign_params{...} with multi-line JSON', (done) => {
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
        winston.verbose("Message sent.", request);
      });
    });
  });

//   it('/if_you_live_IT (_tdCondition) TRUE', (done) => {
//     let listener;
//     let endpointServer = express();
//     endpointServer.use(bodyParser.json());
//     endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
//       res.send({ success: true });
//       const message = req.body;
//       if (message.text.startsWith("myvar:")) {
//         assert(message.text !== null);
//         getChatbotParameters(REQUEST_ID, (err, params) => {
//           if (err) {
//             assert.ok(false);
//           }
//           else {
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
//               winston.verbose("Message sent.", request);
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
//         winston.verbose("Message sent.", request);
//       });
//     });
//   });

//   it('/if_you_live_IT (_tdCondition) FALSE', (done) => {
//     let listener;
//     let endpointServer = express();
//     endpointServer.use(bodyParser.json());
//     endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
//       res.send({ success: true });
//       const message = req.body;
//       if (message.text.startsWith("myvar:")) {
//         assert(message.text !== null);
//         getChatbotParameters(REQUEST_ID, (err, params) => {
//           if (err) {
//             assert.ok(false);
//           }
//           else {
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
//               winston.verbose("Message sent.", request);
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
//         winston.verbose("Message sent.", request);
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
  const url = `${process.env.TILEBOT_ENDPOINT}/ext/${botId}`;
  winston.verbose("sendMessageToBot URL" + url);
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
  axios(
    {
      url: options.url,
      method: options.method,
      data: options.json,
      params: options.params,
      headers: options.headers
    })
    .then((res) => {
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
      if (callback) {
        callback(error, null, null);
      }
    });
}
