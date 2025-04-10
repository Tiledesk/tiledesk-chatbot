var assert = require('assert');
const { IntentForm } = require('../engine/IntentForm');
const { MockTdCache } = require('../engine/mock/MockTdCache');
const { v4: uuidv4 } = require('uuid');

const TYPE_PREFIX = "_tdTypeOf:";

describe('IntentForm', function() {
  
  it('basic form', async () => {
    const form = {
      "cancelCommands": ['annulla', 'cancella', 'reset', 'cancel'],
      "cancelReply": "Form canceled!",
      "fields": [
        {
          "name": "userFullname",
          "type": "type of userFullname",
          "label": "What is your name?"
        },{
          "name": "companyName",
          "type": "type of companyName",
          "label": "Thank you ${userFullname}! What is your Company name?"
        },
        {
          "name": "userEmail",
          "type": "type of userEmail",
          "regex": "/^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/",
          "label": "Hi ${userFullname} from ${companyName}. Your email?",
          "errorLabel": "${userFullname} this email address is invalid\n\nCan you insert a correct email address?"
        }
      ]
    };

    const REQUEST_ID = "support-group-PROJECT_X-" + uuidv4().replace(/-/g, "");

    const chatbot = new Chatbot();
    let intentForm = new IntentForm(
      {
        form: form,
        requestId: REQUEST_ID,
        chatbot: chatbot
      }
    );
    let form_reply1 = await intentForm.getMessage("Trigger form message");
    assert(form_reply1 !== null);
    assert(!form_reply1.canceled);
    // it replies with the next label (aka question)
    assert(form_reply1.message.text === form.fields[0].label);

    let form_reply2 = await intentForm.getMessage("John");
    assert(form_reply2 !== null);
    assert(!form_reply2.canceled);
    const all_parameters = await chatbot.allParameters()
    assert(all_parameters.get(form.fields[0].name) === "John");
    assert(all_parameters.get(TYPE_PREFIX + form.fields[0].name) === form.fields[0].type);
    // it replies with the next label (aka question)
    assert(form_reply2.message.text === form.fields[1].label);

    let form_reply3 = await intentForm.getMessage("Tiledesk");
    assert(form_reply3 !== null);
    assert(!form_reply3.canceled);
    assert(all_parameters.get(form.fields[1].name) === "Tiledesk");
    assert(all_parameters.get(TYPE_PREFIX + form.fields[1].name) === form.fields[1].type);
    // it replies with the next label (aka question)
    assert(form_reply3.message.text === form.fields[2].label);

    // closing form
    let form_reply4 = await intentForm.getMessage("john@email.it");
    assert(form_reply4.end);
    assert(all_parameters.get(form.fields[2].name) === "john@email.it");
    assert(all_parameters.get(TYPE_PREFIX + form.fields[2].name) === form.fields[2].type);
    
  });

  it('validate field. Regex delimited by legacy trailing / /', async () => {
    const form = {
      "cancelCommands": ['annulla', 'cancella', 'reset', 'cancel'],
      "cancelReply": "Form canceled!",
      "fields": [
        {
          "name": "age",
          "type": "number",
          "label": "Your age?",
          "regex": "/^[0-9]+$/",
          "errorLabel": "Invalid age, please try again"
        }
      ]
    };

    const REQUEST_ID = "support-group-PROJECT_X-" + uuidv4().replace(/-/g, "");

    const chatbot = new Chatbot();
    let intentForm = new IntentForm(
      {
        form: form,
        requestId: REQUEST_ID,
        chatbot: chatbot
      }
    );
    let form_reply1 = await intentForm.getMessage("Start");
    assert(form_reply1 !== null);
    assert(!form_reply1.canceled);
    // it replies with the next label (aka question)
    assert(form_reply1.message.text === form.fields[0].label);

    let form_reply2 = await intentForm.getMessage("not a number");
    assert(form_reply2 !== null);
    assert(!form_reply2.canceled);
    const all_parameters = await chatbot.allParameters()
    assert(all_parameters.get("age") == null);
    // it replies with the error message
    assert(form_reply2.message.text === form.fields[0].errorLabel);

    let form_reply3 = await intentForm.getMessage("001");
    assert(form_reply3 !== null);
    assert(!form_reply3.canceled);
    assert(form_reply3.end);
    assert(all_parameters.get(form.fields[0].name) === "001");
    assert(all_parameters.get(TYPE_PREFIX + form.fields[0].name) === form.fields[0].type);
    
  });

  it('validate field. Regex with no //', async () => {
    const form = {
      "cancelCommands": ['annulla', 'cancella', 'reset', 'cancel'],
      "cancelReply": "Form canceled!",
      "fields": [
        {
          "name": "rating",
          "type": "text",
          "label": "Your rating?",
          "regex": "A+",
          "errorLabel": "Invalid field, 'A' only rating is permitted, with no spaces"
        }
      ]
    };

    const REQUEST_ID = "support-group-PROJECT_X-" + uuidv4().replace(/-/g, "");

    const chatbot = new Chatbot();
    let intentForm = new IntentForm(
      {
        form: form,
        requestId: REQUEST_ID,
        chatbot: chatbot
      }
    );
    let form_reply1 = await intentForm.getMessage("Start");
    assert(form_reply1 !== null);
    assert(!form_reply1.canceled);
    // it replies with the next label (aka question)
    assert(form_reply1.message.text === form.fields[0].label);

    let form_reply2 = await intentForm.getMessage("not a number");
    assert(form_reply2 !== null);
    assert(!form_reply2.canceled);
    const all_parameters = await chatbot.allParameters();
    assert(all_parameters.get("age") == null);
    // it replies with the error message
    assert(form_reply2.message.text === form.fields[0].errorLabel);

    let form_reply3 = await intentForm.getMessage("AAA");
    assert(form_reply3 !== null);
    assert(!form_reply3.canceled);
    assert(form_reply3.end);
    assert(all_parameters.get(form.fields[0].name) === "AAA");
    assert(all_parameters.get(TYPE_PREFIX + form.fields[0].name) === form.fields[0].type);
    
  });

  it('cancel form editing', async () => {
    const form = {
      "cancelCommands": ['reset', 'cancel'],
      "cancelReply": "Form canceled!",
      "fields": [
        {
          "name": "fullname",
          "type": "text",
          "label": "Your fullname",
          "regex": "[a-zA-Z]+",
          "errorLabel": "Invalid fullname"
        }
      ]
    };

    const REQUEST_ID = "support-group-PROJECT_X-" + uuidv4().replace(/-/g, "");

    const chatbot = new Chatbot();
    let intentForm = new IntentForm(
      {
        form: form,
        requestId: REQUEST_ID,
        chatbot: chatbot
      }
    );
    let form_reply1 = await intentForm.getMessage("Start");
    assert(form_reply1 !== null);
    assert(!form_reply1.canceled);
    // it replies with the next label (aka question)
    assert(form_reply1.message.text === form.fields[0].label);
    let form_reply2 = await intentForm.getMessage("reset");
    assert(form_reply2 !== null);
    assert(form_reply2.canceled);
    const all_parameters = await chatbot.allParameters();
    assert(all_parameters.size === 0);
    assert(form_reply2.message.text === form.cancelReply);
    
  });
    
});

class Chatbot {
      
  constructor() {
    this.tdcache = new MockTdCache();
    this.requestParameters = new Map();
  }

  async addParameter(parameter_name, parameter_value) {
    this.requestParameters.set(parameter_name, parameter_value);
    return true;
  }

  async allParameters() {
    return new Promise( (resolve) => {
      resolve(this.requestParameters);
    });
  }
  
}