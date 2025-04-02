var assert = require('assert');
const { ExtUtil } = require('../ExtUtil');
const { IntentForm } = require('../engine/IntentForm');
const { MockTdCache } = require('../engine/mock/MockTdCache');
const { v4: uuidv4 } = require('uuid');

const TYPE_PREFIX = "_tdTypeOf:";

describe('IntentForm - pre-filled', function() {

  it('basic form with 1 field, pre-filled', async () => {
    const form = {
      "fields": [
        {
          "name": "userFullname",
          "type": "string",
          "label": "What is your name?"
        }
      ]
    };

    const REQUEST_ID = "support-group-PROJECT_X-" + uuidv4().replace(/-/g, "");

    const chatbot = new Chatbot();
    await chatbot.addParameter('userFullname', "Already Andrea");
    let all_parameters = await chatbot.allParameters();

    let intentForm = new IntentForm(
      {
        form: form,
        requestId: REQUEST_ID,
        chatbot: chatbot,
        requestParameters: all_parameters,
        log: false
      }
    );
    let form_reply1 = await intentForm.getMessage("Trigger message");

    assert(form_reply1 !== null);
    assert(!form_reply1.canceled);
    assert(form_reply1.end);
    assert(all_parameters[form.fields[0].name] === "Already Andrea");
    assert(all_parameters[TYPE_PREFIX + form.fields[0].name] === form.fields[0].type);
  });

  it('basic form with 2 fields, both pre-filled', async () => {
    const form = {
      "fields": [
        {
          "name": "userFullname",
          "type": "string",
          "label": "What is your name?"
        },
        {
          "name": "userEmail",
          "type": "string",
          "label": "What is your email?"
        }
      ]
    };

    const REQUEST_ID = "support-group-PROJECT_X-" + uuidv4().replace(/-/g, "");

    const chatbot = new Chatbot();
    await chatbot.addParameter('userFullname', "Already Andrea");
    await chatbot.addParameter('userEmail', "Already Email");
    let all_parameters = await chatbot.allParameters();

    let intentForm = new IntentForm(
      {
        form: form,
        requestId: REQUEST_ID,
        chatbot: chatbot,
        requestParameters: all_parameters,
        log: false
      }
    );
    let form_reply1 = await intentForm.getMessage("Trigger message");

    assert(form_reply1 !== null);
    assert(!form_reply1.canceled);
    assert(form_reply1.end);
    assert(all_parameters[form.fields[0].name] === "Already Andrea");
    assert(all_parameters[TYPE_PREFIX + form.fields[0].name] === form.fields[0].type);
    assert(all_parameters[form.fields[1].name] === "Already Email");
    assert(all_parameters[TYPE_PREFIX + form.fields[1].name] === form.fields[1].type);
  });

  it('basic form with 3 fields, only 1st & 2nd pre-filled', async () => {
    const form = {
      "fields": [
        {
          "name": "userFullname",
          "type": "string",
          "label": "What is your name?"
        },
        {
          "name": "userEmail",
          "type": "string",
          "label": "What is your email?"
        },
        {
          "name": "companyName",
          "type": "longString",
          "label": "Company name?"
        }
      ]
    };

    const REQUEST_ID = "support-group-PROJECT_X-" + uuidv4().replace(/-/g, "");

    const chatbot = new Chatbot();
    await chatbot.addParameter('userFullname', "Already Andrea");
    await chatbot.addParameter('userEmail', "Already Email");
    let all_parameters = await chatbot.allParameters();

    let intentForm = new IntentForm(
      {
        form: form,
        requestId: REQUEST_ID,
        chatbot: chatbot,
        requestParameters: all_parameters,
        log: false
      }
    );
    let form_reply1 = await intentForm.getMessage("Trigger message");

    assert(form_reply1 !== null);
    assert(!form_reply1.canceled);
    assert(form_reply1.message.text === form.fields[2].label);
    
    let form_reply2 = await intentForm.getMessage("Tiledesk");

    assert(form_reply2 !== null);
    assert(!form_reply2.canceled);
    assert(form_reply2.end);
    assert(all_parameters[form.fields[2].name] === "Tiledesk");
    assert(all_parameters[TYPE_PREFIX + form.fields[2].name] === form.fields[2].type);
    
    assert(all_parameters[form.fields[0].name] === "Already Andrea");
    assert(all_parameters[TYPE_PREFIX + form.fields[0].name] === form.fields[0].type);
    assert(all_parameters[form.fields[1].name] === "Already Email");
    assert(all_parameters[TYPE_PREFIX + form.fields[1].name] === form.fields[1].type);
    assert(all_parameters[form.fields[2].name] === "Tiledesk");
    assert(all_parameters[TYPE_PREFIX + form.fields[2].name] === form.fields[2].type);

  });

  it('basic form with 6 fields, 1st & 2nd pre-filled, 3rd not pre-filled, 4th (tel) pre-filled, 5th not pre-filled, 6th (age) pre-filled', async () => {
    const form = {
      "fields": [
        {
          "name": "userFullname",
          "type": "string",
          "label": "What is your name?"
        },
        {
          "name": "userEmail",
          "type": "string",
          "label": "What is your email?"
        },
        {
          "name": "companyName",
          "type": "string",
          "label": "Company name?"
        },
        {
          "name": "tel",
          "type": "longString",
          "label": "Your phone number?"
        },
        {
          "name": "SSN",
          "type": "longString",
          "label": "Your SSN?"
        },
        {
          "name": "age",
          "type": "number",
          "label": "Your age?"
        }
      ]
    };

    const REQUEST_ID = "support-group-PROJECT_X-" + uuidv4().replace(/-/g, "");

    const chatbot = new Chatbot();
    await chatbot.addParameter('userFullname', "Already Andrea");
    await chatbot.addParameter('userEmail', "Already Email");
    await chatbot.addParameter('tel', "0000");
    await chatbot.addParameter('age', "49");
    
    let all_parameters = await chatbot.allParameters();

    let intentForm = new IntentForm(
      {
        form: form,
        requestId: REQUEST_ID,
        chatbot: chatbot,
        requestParameters: all_parameters,
        log: false
      }
    );
    let form_reply1 = await intentForm.getMessage("Trigger message");

    assert(form_reply1 !== null);
    assert(!form_reply1.canceled);
    assert(form_reply1.message.text === form.fields[2].label);
    
    let form_reply2 = await intentForm.getMessage("Tiledesk");

    assert(form_reply2 !== null);
    assert(!form_reply2.canceled);
    assert(form_reply2.message);
    assert(form_reply2.message.text === form.fields[4].label) // asks the next "editable" field's label (SSN)
    assert(all_parameters[form.fields[2].name] === "Tiledesk");
    assert(all_parameters[TYPE_PREFIX + form.fields[2].name] === form.fields[2].type);

    let form_reply3 = await intentForm.getMessage("SPNNDR0000");

    assert(form_reply3 !== null);
    assert(!form_reply3.canceled);
    assert(form_reply3.end);
    
    assert(all_parameters[form.fields[0].name] === "Already Andrea");
    assert(all_parameters[TYPE_PREFIX + form.fields[0].name] === form.fields[0].type);
    assert(all_parameters[form.fields[1].name] === "Already Email");
    assert(all_parameters[TYPE_PREFIX + form.fields[1].name] === form.fields[1].type);
    assert(all_parameters[form.fields[2].name] === "Tiledesk");
    assert(all_parameters[TYPE_PREFIX + form.fields[2].name] === form.fields[2].type);
    assert(all_parameters[form.fields[3].name] === "0000");
    assert(all_parameters[TYPE_PREFIX + form.fields[3].name] === form.fields[3].type);
    assert(all_parameters[form.fields[4].name] === "SPNNDR0000");
    assert(all_parameters[TYPE_PREFIX + form.fields[4].name] === form.fields[4].type);
    assert(all_parameters[form.fields[5].name] === "49");
    assert(all_parameters[TYPE_PREFIX + form.fields[5].name] === form.fields[5].type);

  });
    
});

class Chatbot {
      
  constructor() {
    this.tdcache = new MockTdCache();
    this.requestParameters = {};
  }

  async addParameter(parameter_name, parameter_value) {
    this.requestParameters[parameter_name] = parameter_value;
    return true;
  }

  async allParameters() {
    return new Promise( (resolve) => {
      resolve(this.requestParameters);
    });
  }
  
}