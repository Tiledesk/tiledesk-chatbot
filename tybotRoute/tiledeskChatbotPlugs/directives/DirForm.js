const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { DirIntent } = require('./DirIntent');
const { DirLockIntent } = require('../tiledeskChatbotPlugs/directives/DirLockIntent');
const { DirUnlockIntent } = require('../tiledeskChatbotPlugs/directives/DirUnlockIntent');

class DirForm {
  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdclient = context.tdclient;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("Incorrect directive:", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, (stop) => {
      if (this.log) {console.log("(webrequestv2, stop?", stop); }
      callback(stop);
    });
  }

  async go(action, callback) {
    let intent_name = answerObj.intent_display_name
    // THE FORM
    // if (intent_name === "test_form_intent") {
    //   answerObj.form = {
    //     "cancelCommands": ['reset', 'cancel'],
    //     "cancelReply": "Ok canceled!",
    //     "fields": [
    //       {
    //         "name": "userFullname",
    //         "type": "text",
    //         "label": "What is your name?\n* Andrea\n* Marco\n* Mirco\n* Luca Leo"
    //       },{
    //         "name": "companyName",
    //         "type": "text",
    //         "label": "Thank you ${userFullname}! What is your Company name?\n* Tiledesk\n* Frontiere21"
    //       },
    //       {
    //         "name": "userEmail",
    //         "type": "text",
    //         "regex": "/^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/",
    //         "label": "Hi ${userFullname} from ${companyName}\n\nJust one last question\n\nYour email 🙂\n* andrea@libero.it\n* andrea@tiledesk.com",
    //         "errorLabel": "${userFullname} this email address is invalid\n\nCan you insert a correct email address?"
    //       }
    //     ]
    //   };
    // }
    let intent_form = answerObj.form;
    if (this.log) {
      console.log("IntentForm.isValidForm(intent_form)", IntentForm.isValidForm(intent_form));
    }
    let clientUpdateUserFullname = null;
    if (IntentForm.isValidForm(intent_form)) {
      await this.lockIntent(this.requestId, intent_name);
      const user_reply = message.text;
      let form_reply = await this.execIntentForm(user_reply, intent_form);
      // console.log("got form reply", form_reply)
      if (!form_reply.canceled && form_reply.message) {
        // console.log("Form replying for next field...");
        if (this.log) {console.log("Sending form reply...", form_reply.message)}
        // reply with this message (ex. please enter your fullname)
        if (!form_reply.message.attributes) {
          form_reply.message.attributes = {}
        }
        form_reply.message.attributes.fillParams = true;
        form_reply.message.attributes.splits = true;
        form_reply.message.attributes.markbot = true;
        return form_reply.message;
      }
      else if (form_reply.end) {
        if (this.log) {
          console.log("FORM end.", );
          console.log("unlocking intent for request:", this.requestId);
          console.log("populate data on lead:", JSON.stringify(lead));
        }
        this.unlockIntent(this.requestId);
        if (lead) {
          this.populatePrechatFormAndLead(lead._id, this.requestId);
        }
        else {
          if (this.log) {console.log("No lead. Skipping populatePrechatFormAndLead()");}
        }
        const all_parameters = await this.allParameters();
        // if (this.log) {console.log("We have all_parameters:", all_parameters)};
        if (all_parameters && all_parameters["userFullname"]) {
          clientUpdateUserFullname = all_parameters["userFullname"];
        }
      }
      else if (form_reply.canceled) {
        console.log("Form canceled.");
        if (this.log) {console.log("unlocking intent due to canceling, for request", this.requestId);}
        this.unlockIntent(this.requestId);
        if (this.log) {console.log("sending form 'cancel' reply...", form_reply.message)}
        // reply with this message (ex. please enter your fullname)
        if (!form_reply.message.attributes) {
          form_reply.message.attributes = {}
        }
        form_reply.message.attributes.fillParams = true;
        form_reply.message.attributes.splits = true;
        form_reply.message.attributes.directives = true;
        // // used by the Clients to get some info about the intent that generated this reply
        // form_reply.message.attributes.intent_display_name = faq.intent_display_name;
        // form_reply.message.attributes.intent_id = faq.intent_id;
        return form_reply.message
      }
    }
    // FORM END
  }

  async lockIntent(requestId, intent_name) {
    // await this.tdcache.set("tilebot:requests:"  + requestId + ":locked", intent_name);
    await DirLockIntent.lockIntent(this.tdcache, requestId, intent_name);
  }

}

module.exports = { DirForm };