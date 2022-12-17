var assert = require('assert');
const { ExtUtil } = require('../ExtUtil');
const { IntentForm } = require('../models/IntentForm');

describe('IntentForm', function() {
  
  it('basic form', async () => {
    const form = {
      "cancelCommands": ['annulla', 'cancella', 'reset', 'cancel'],
      "cancelReply": "Ok annullato!",
      "cancelReplyIntent": "formCanceled", // TODO IDEA
      "fields": [
        {
          "name": "userFullname",
          "type": "text",
          "label": "What is your name?\n* Andrea\n* Marco\n* Mirco\n* Luca Leo"
        },{
          "name": "companyName",
          "type": "text",
          "label": "Thank you ${userFullname}! What is your Company name?\n* Tiledesk\n* Frontiere21"
        },
        {
          "name": "userEmail",
          "type": "text",
          "regex": "/^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/",
          "label": "Hi ${userFullname} from ${companyName}\n\nJust one last question\n\nYour email 🙂\n* andrea@libero.it\n* andrea@tiledesk.com",
          "errorLabel": "${userFullname} this email address is invalid\n\nCan you insert a correct email address?"
        }
      ]
    };

    class Chatbot {
      async addParameter(requestId, parameter_name, parameter_value) {
        return true;
      }
      
    }

    const PROJECT_ID = process.env.TEST_PROJECT_ID;
    const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + Date.now();
    const BOT_ID = process.env.TEST_BOT_ID;
    const CHATBOT_TOKEN = process.env.CHATBOT_TOKEN;

    const chatbot = new Chatbot();
    let request = {
      "payload": {
        "senderFullname": "guest",
        "type": "text",
        "sender": "A-SENDER",
        "recipient": REQUEST_ID,
        "text": "/good_form",
        "id_project": PROJECT_ID,
        "request": {
          "request_id": REQUEST_ID,
          "id_project": PROJECT_ID
        }
      },
      "token": CHATBOT_TOKEN
    }
    console.log("executing intent form...")
    let intentForm = new IntentForm(
      {
        form: form,
        requestId: REQUEST_ID,
        chatbot: chatbot,
        log: true
      }
    );
    let message = await intentForm.getMessage(userInputReply);
    
  });
    
});



