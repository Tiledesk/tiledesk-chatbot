var assert = require('assert');
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil');

describe('Convert text reply', function() {
  
    it('text reply with json buttons', async () => {
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
                          "type": "text",
                          "text": "I didn't understand. Can you rephrase your question?",
                          "attributes": {
                              "attachment": {
                                  "type": "template",
                                  "buttons": [],
                                  "json_buttons": '[{"type":"action","value":"Button1","action":"#action_id","alias":"button1 alias"},{"type":"text","value":"Button2 text"},{"type":"url","value":"Button3 link","link":"http://"}]'
                              }
                          }
                      }
                  }
              ]
          },
          "_tdActionId": "d23366ee19b74432a9cd3514af028f59"
      }
      TiledeskChatbotUtil.replaceJSONButtons(message);
      console.log("message:", JSON.stringify(message, null, "  "));
      assert(message.attributes.commands[1].message.attributes.attachment.buttons.length === 3);
      // button 1
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].type === "action");
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].value === "Button1");
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].action === "#action_id");
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].alias === "button1 alias");
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].show_echo === true);
      //button 2
      assert(message.attributes.commands[1].message.attributes.attachment.buttons.length === 3);
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].type === "text");
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].value === "Button2 text");
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].action === undefined);
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].alias === undefined);
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].show_echo === true);
      //button 3
      assert(message.attributes.commands[1].message.attributes.attachment.buttons.length === 3);
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[2].type === "url");
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[2].value === "Button3 link");
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[2].link === "http://");
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[2].action === undefined);
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[2].alias === undefined);
      assert(message.attributes.commands[1].message.attributes.attachment.buttons[2].show_echo === true);
    });

    it('text reply with wrong json buttons - original buttons are preserved', async () => {
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
                        "type": "text",
                        "text": "I didn't understand. Can you rephrase your question?",
                        "attributes": {
                            "attachment": {
                                "type": "template",
                                "buttons": [
                                  {
                                      "type": "action",
                                      "value": "Original Button1",
                                      "action": "#action_id",
                                      "alias": "button1 alias"
                                  },
                                  {
                                    "type": "action",
                                    "value": "Original Button2",
                                    "action": "#action_id",
                                    "alias": "button1 alias"
                                }
                              ],
                                "json_buttons": '[{"type":"wrong","value":"Button1","action":"#action_id","alias":"button1 alias"},{"type":"wrong","value":"Button2 text"},{"type":"wrong","value":"Button3 link","link":"http://"}]'
                            }
                        }
                    }
                }
            ]
        },
        "_tdActionId": "d23366ee19b74432a9cd3514af028f59"
    }
    TiledeskChatbotUtil.replaceJSONButtons(message);
    console.log("message:", JSON.stringify(message, null, "  "));
    assert(message.attributes.commands[1].message.attributes.attachment.buttons.length === 2);
    // button 1
    assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].type === "action");
    assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].value === "Original Button1");
    //button 2
    assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].type === "action");
    assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].value === "Original Button2");
  });

  it('text reply with no json buttons - original buttons are preserved', async () => {
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
                      "type": "text",
                      "text": "I didn't understand. Can you rephrase your question?",
                      "attributes": {
                          "attachment": {
                              "type": "template",
                                "buttons": [
                                    {
                                        "type": "action",
                                        "value": "Original Button1",
                                        "action": "#action_id",
                                        "alias": "button1 alias"
                                    },
                                    {
                                    "type": "action",
                                    "value": "Original Button2",
                                    "action": "#action_id",
                                    "alias": "button1 alias"
                                    }
                                ]
                            }
                        }
                    }
                }
            ]
        },
        "_tdActionId": "d23366ee19b74432a9cd3514af028f59"
  }
  TiledeskChatbotUtil.replaceJSONButtons(message);
  console.log("message:", JSON.stringify(message, null, "  "));
  assert(message.attributes.commands[1].message.attributes.attachment.buttons.length === 2);
  // button 1
  assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].type === "action");
  assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].value === "Original Button1");
  //button 2
  assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].type === "action");
  assert(message.attributes.commands[1].message.attributes.attachment.buttons[1].value === "Original Button2");
});

  it('text reply with "some" wrong json buttons - original buttons not preserved, only good buttons added', async () => {
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
                      "type": "text",
                      "text": "I didn't understand. Can you rephrase your question?",
                      "attributes": {
                          "attachment": {
                              "type": "template",
                              "buttons": [
                                {
                                    "type": "action",
                                    "value": "Original Button1",
                                    "action": "#action_id",
                                    "alias": "button1 alias"
                                },
                                {
                                  "type": "action",
                                  "value": "Original Button2",
                                  "action": "#action_id",
                                  "alias": "button1 alias"
                              }
                            ],
                              "json_buttons": '[{"type":"action","value":"Button1","action":"#action_id","alias":"button1 alias"},{"type":"wrong","value":"Button2 text"},{"type":"wrong","value":"Button3 link","link":"http://"}]'
                          }
                      }
                  }
              }
          ]
      },
      "_tdActionId": "d23366ee19b74432a9cd3514af028f59"
    }
    TiledeskChatbotUtil.replaceJSONButtons(message);
    console.log("message:", JSON.stringify(message, null, "  "));
    assert(message.attributes.commands[1].message.attributes.attachment.buttons.length === 1);
    // button 1
    assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].type === "action");
    assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].value === "Button1");
    assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].action === "#action_id");
    assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].alias === "button1 alias");
    assert(message.attributes.commands[1].message.attributes.attachment.buttons[0].show_echo === true);
  });

});