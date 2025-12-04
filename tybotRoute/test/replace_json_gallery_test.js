var assert = require('assert');
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');

describe('Convert json gallery', function() {
  
    it('json gallery only, one element, one button type: url', async () => {
        const message = {
          "_tdActionType": "replyv2",
          "text": "I didn't understand. Can you rephrase your question?",
          "attributes": {
              "commands": [
                  {
                      "type": "wait",
                      "time": 500
                  },
                  {
                        "type": "message",
                        "message": {
                            "type": "gallery",
                            "text": "",
                            "attributes": {
                                "attachment": {
                                    "type": "gallery",
                                    "json_gallery":
`[
    {
        "preview": {
            "src": "https://img1.png"
        },
        "title": "Title 1",
        "description": "Description 1",
        "buttons": [{"type": "url","value": "Button1 link","link": "http://1"}]
    }
]`
                                } 
                            }
                        }
                  }
              ]
          },
          "_tdActionId": "d23366ee19b74432a9cd3514af028f59"
      }
      assert(message.attributes.commands[1].message.attributes.attachment.json_gallery);
      assert(message.attributes.commands[1].message.attributes.attachment.gallery === undefined);
      TiledeskChatbotUtil.replaceJSONGalleries(message);
      assert(message.attributes.commands[1].message.attributes.attachment.gallery);
      assert(message.attributes.commands[1].message.attributes.attachment.json_gallery === undefined);
      assert(message.attributes.commands[1].message.attributes.attachment.type === "gallery");
      assert(message.attributes.commands[1].message.attributes.attachment.gallery[0]);
      assert(message.attributes.commands[1].message.attributes.attachment.gallery[0].preview);
      assert(message.attributes.commands[1].message.attributes.attachment.gallery[0].preview.src === "https://img1.png");
      assert(message.attributes.commands[1].message.attributes.attachment.gallery[0].buttons);
      assert(message.attributes.commands[1].message.attributes.attachment.gallery[0].buttons.length === 1);
      assert(message.attributes.commands[1].message.attributes.attachment.gallery[0].buttons[0].type === "url");
      assert(message.attributes.commands[1].message.attributes.attachment.gallery[0].buttons[0].value === "Button1 link");
      assert(message.attributes.commands[1].message.attributes.attachment.gallery[0].buttons[0].link === "http://1");
      
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].action === "#action_id");
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].alias === "button1 alias");
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].show_echo === true);
    //   //button 2
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons.length === 3);
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].type === "text");
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].value === "Button2 text");
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].action === undefined);
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].alias === undefined);
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].show_echo === true);
    //   //button 3
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons.length === 3);
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[2].type === "url");
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[2].value === "Button3 link");
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[2].link === "http://");
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[2].action === undefined);
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[2].alias === undefined);
    //   assert(message.attributes.commands[1].message.attributes.attachment.buttons[2].show_echo === true);
    });

    // {
    //     "type": "message",
    //     "message": {
    //         "type": "gallery",
    //         "text": "",
    //         "attributes": {
    //             "attachment": {
    //                 "type": "gallery",
    //                 "gallery": [
    //                     {
                            // "preview": {
                            //     "name": "hybrid-settings.png",
                            //     "src": "https://eu.rtmv3.tiledesk.com/api/images?path=uploads%2Fusers%2F63a05d755f117f0013541383%2Fimages%2F8913ff2c-d788-45e1-ac71-ee5bae8479e2%2Fhybrid-settings.png",
                            //     "width": 1410,
                            //     "height": 1568,
                            //     "type": "image/png",
                            //     "uid": "mcamfa6s",
                            //     "size": 299384,
                            //     "downloadURL": "https://eu.rtmv3.tiledesk.com/api/images?path=uploads%2Fusers%2F63a05d755f117f0013541383%2Fimages%2F8913ff2c-d788-45e1-ac71-ee5bae8479e2%2Fhybrid-settings.png"
                            // },
                            // "title": "Title 1",
                            // "description": "Description",
    //                         "buttons": [
    //                             {
    //                                 "uid": "0a956f4637584ee4862360c19a161f8f",
    //                                 "type": "url",
    //                                 "value": "Prod1",
    //                                 "link": "https://URL1",
    //                                 "target": "blank",
    //                                 "action": "",
    //                                 "attributes": "",
    //                                 "show_echo": true
    //                             },
    //                             {
    //                                 "uid": "4a87abe3d03a4b6fbdbc3fc33c4a8430",
    //                                 "type": "action",
    //                                 "value": "Prod1.1 (connector)",
    //                                 "link": "",
    //                                 "target": "blank",
    //                                 "action": "#0f7aaefd-3147-466b-82a4-06756f36eea5",
    //                                 "attributes": "",
    //                                 "show_echo": true
    //                             },
    //                             {
    //                                 "uid": "31fac2c82ce24da0a2e9850a32165fe8",
    //                                 "type": "text",
    //                                 "value": "Prod1.2 (text)",
    //                                 "link": "https://url2",
    //                                 "target": "blank",
    //                                 "action": "",
    //                                 "attributes": "",
    //                                 "show_echo": true
    //                             }
    //                         ]
    //                     },
    //                     {
    //                         "preview": {
    //                             "name": "hybrid.png",
    //                             "src": "https://eu.rtmv3.tiledesk.com/api/images?path=uploads%2Fusers%2F63a05d755f117f0013541383%2Fimages%2F373c9fa3-3271-4492-b27c-2566bdc64533%2Fhybrid.png",
    //                             "width": 924,
    //                             "height": 508,
    //                             "type": "image/png",
    //                             "uid": "mcapva5m",
    //                             "size": 53665,
    //                             "downloadURL": "https://eu.rtmv3.tiledesk.com/api/images?path=uploads%2Fusers%2F63a05d755f117f0013541383%2Fimages%2F373c9fa3-3271-4492-b27c-2566bdc64533%2Fhybrid.png"
    //                         },
    //                         "title": "Titolo 2",
    //                         "description": "Desc 2",
    //                         "buttons": [
    //                             {
    //                                 "uid": "9f20dfc3b1ef4721ac5c2760e4a75f3b",
    //                                 "type": "text",
    //                                 "value": "Button",
    //                                 "link": "",
    //                                 "target": "blank",
    //                                 "action": "",
    //                                 "attributes": "",
    //                                 "show_echo": true
    //                             }
    //                         ]
    //                     }
    //                 ]
    //             }
    //         }
    //     }
    // }

});