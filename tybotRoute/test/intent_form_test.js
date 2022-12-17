var assert = require('assert');
const { ExtUtil } = require('../ExtUtil');
const { IntentForm } = require('../models/IntentForm');
const { MockTdCache } = require('../models/MockTdCache');

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
          "label": "What is your name?"
        },{
          "name": "companyName",
          "type": "text",
          "label": "Thank you ${userFullname}! What is your Company name?"
        },
        {
          "name": "userEmail",
          "type": "text",
          "regex": "/^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/",
          "label": "Hi ${userFullname} from ${companyName}. Your email?",
          "errorLabel": "${userFullname} this email address is invalid\n\nCan you insert a correct email address?"
        }
      ]
    };

    class Chatbot {
      
      constructor(requestId) {
        this.tdcache = new MockTdCache();
        this.requestParameters = new Map();
      }

      async addParameter(requestId, parameter_name, parameter_value) {
        this.requestParameters.set(parameter_name, parameter_value);
        return true;
      }

      async allParameters() {
        return new Promise( (resolve) => {
          resolve(this.requestParameters);
        });
      }
      
    }

    const PROJECT_ID = "XXX";
    const REQUEST_ID = "support-group-PROJECT_X-" + Date.now();

    const chatbot = new Chatbot();
    // console.log("executing intent form...")
    let intentForm = new IntentForm(
      {
        form: form,
        requestId: REQUEST_ID,
        chatbot: chatbot,
        log: false
      }
    );
    let form_reply1 = await intentForm.getMessage("Start");
    // console.log("got form reply", form_reply1)
    // if (!form_reply.canceled && form_reply.message) {
    // console.log("form db:", chatbot.tdcache.db)
    assert(form_reply1 !== null);
    assert(!form_reply1.canceled);
    // it replies with the next label (aka question)
    assert(form_reply1.message.text === form.fields[0].label);

    let form_reply2 = await intentForm.getMessage("John");
    // console.log("got form reply2", form_reply2)
    assert(form_reply2 !== null);
    assert(!form_reply2.canceled);
    const all_parameters = await chatbot.allParameters()
    assert(all_parameters.get("userFullname") === "John");
    // it replies with the next label (aka question)
    assert(form_reply2.message.text === form.fields[1].label);

    let form_reply3 = await intentForm.getMessage("Tiledesk");
    // console.log("got form reply3", form_reply3);
    assert(form_reply3 !== null);
    assert(!form_reply3.canceled);
    assert(all_parameters.get("companyName") === "Tiledesk");
    // it replies with the next label (aka question)
    assert(form_reply3.message.text === form.fields[2].label);

    // closing form
    let form_reply4 = await intentForm.getMessage("john@email.it");
    // console.log("got form reply4", form_reply4);
    assert(all_parameters.get("userEmail") === "john@email.it");
    assert(form_reply4.end);

    // }
    // else if (form_reply.end) {
    //   console.log("FORM end.", );
    //   done();
    // }
    // else if (form_reply.canceled) {
    //   console.log("Form canceled.");
    //   return form_reply.message
    // }

    
    
  });
    
});

