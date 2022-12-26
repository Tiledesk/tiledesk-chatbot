var assert = require('assert');
const { ExtUtil } = require('../ExtUtil');
const { IntentForm } = require('../models/IntentFormStudy');
const { MockTdCache } = require('../models/MockTdCache');
const { v4: uuidv4 } = require('uuid');

const TYPE_PREFIX = "_tdTypeOf:";

describe('IntentForm', function() {

  // it('basic form with 1 field, pre-filled', async () => {
  //   const form = {
  //     "fields": [
  //       {
  //         "name": "userFullname",
  //         "type": "string",
  //         "label": "What is your name?"
  //       }
  //     ]
  //   };

  //   const REQUEST_ID = "support-group-PROJECT_X-" + uuidv4().replace(/-/g, "");

  //   const chatbot = new Chatbot();
  //   await chatbot.addParameter('userFullname', "Already Andrea");
  //   let all_parameters = await chatbot.allParameters();
  //   console.log("executing intent form...")
  //   let intentForm = new IntentForm(
  //     {
  //       form: form,
  //       requestId: REQUEST_ID,
  //       chatbot: chatbot,
  //       requestParameters: all_parameters,
  //       log: true
  //     }
  //   );
  //   let form_reply1 = await intentForm.getMessage("Trigger message");
  //   console.log("Got form first field label:", form_reply1)
  //   assert(form_reply1 !== null);
  //   assert(!form_reply1.canceled);
  //   assert(form_reply1.end);
  //   assert(all_parameters[form.fields[0].name] === "Already Andrea");
  //   assert(all_parameters[TYPE_PREFIX + form.fields[0].name] === form.fields[0].type);
  // });

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
    console.log("executing intent form...")
    let intentForm = new IntentForm(
      {
        form: form,
        requestId: REQUEST_ID,
        chatbot: chatbot,
        requestParameters: all_parameters,
        log: true
      }
    );
    let form_reply1 = await intentForm.getMessage("Trigger message");
    console.log("Got form first field label:", form_reply1)
    assert(form_reply1 !== null);
    assert(!form_reply1.canceled);
    assert(form_reply1.end);
    assert(all_parameters[form.fields[0].name] === "Already Andrea");
    assert(all_parameters[TYPE_PREFIX + form.fields[0].name] === form.fields[0].type);
    assert(all_parameters[form.fields[1].name] === "Already Email");
    assert(all_parameters[TYPE_PREFIX + form.fields[1].name] === form.fields[1].type);
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