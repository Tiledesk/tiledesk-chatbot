const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { DirIntent } = require('./DirIntent');
const { IntentForm } = require('../../engine/IntentForm.js');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../utils/winston');

class DirForm {
  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.intentDir = new DirIntent(context);

    console.log("\n\n\nDIR FORMmmm")
    this.API_ENDPOINT = context.API_ENDPOINT;
    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___"
    });

  }

  execute(directive, callback) {
    winston.verbose("Execute Form directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirForm Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
  }

  async go(action, callback) {
    // THE FORM
    // if (intent_name === "test_form_intent") {
    //   action.form = {
    //     "cancelCommands": ['reset', 'cancel'],
    //     "cancelReply": "Ok canceled!", // REMOVE
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
    const trueIntent = action.trueIntent; // edit-end (success)
    const falseIntent = action.falseIntent; // cancel
    let form = action.form;
    winston.debug("(DirForm) IntentForm.isValidForm(intent_form) " + IntentForm.isValidForm(form));
    
    let clientUpdateUserFullname = null;
    if (IntentForm.isValidForm(form)) {
      await this.chatbot.lockAction(this.requestId, action.action_id);
      const user_reply = message.text;
      let form_reply = await this.execIntentForm(user_reply, form);
      if (!form_reply.canceled && form_reply.message) {
        winston.debug("(DirForm) Sending form reply...", form_reply.message)
        // reply with this message (ex. please enter your fullname)
        if (!form_reply.message.attributes) {
          form_reply.message.attributes = {}
        }
        form_reply.message.attributes.fillParams = true;
        form_reply.message.attributes.splits = true;
        form_reply.message.attributes.markbot = true;
        // return form_reply.message;

        this.tdClient.sendSupportMessage(
          this.requestId,
          form_reply.message,
          (err) => {
            if (err) {
              winston.error("(DirForm) Error sending form reply: " + err.message);
            }
            winston.debug("(DirForm) Form reply message sent.");
            callback(true);
        });
      }
      else if (form_reply.end) {
        winston.debug("(DirForm) FORM end.", );
        winston.debug("(DirForm) unlocking intent for request: " + this.requestId);
        winston.debug("(DirForm) populate data on lead: ", lead);

        this.chatbot.unlockAction(this.requestId);

        if (callback) {
          this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
            callback(false); // continue the flow
          });
        }
        // TODO: INVOKE DIR_INTENT FOR END-FORM (SUCCESS)
        // if (lead) {
        //   this.populatePrechatFormAndLead(lead._id, this.requestId);
        // }
        // const all_parameters = await this.chatbot.allParameters();
        // if (all_parameters && all_parameters["userFullname"]) {
        //   clientUpdateUserFullname = all_parameters["userFullname"];
        // }
      }
      else if (form_reply.canceled) {
        winston.debug("(DirForm) unlocking intent due to canceling, for request " + this.requestId);
        this.unlockAction(this.requestId);

        // TODO: INVOKE DIR_INTENT FOR CANCEL.
        if (callback) {
          this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
            callback(false); // continue the flow
          });
        }

        // TODO: REMOVE CANCEL REPLY
        // reply with this message (ex. please enter your fullname)
        // if (!form_reply.message.attributes) {
        //   form_reply.message.attributes = {}
        // }
        // form_reply.message.attributes.fillParams = true;
        // form_reply.message.attributes.splits = true;
        // form_reply.message.attributes.directives = true;
        // // used by the Clients to get some info about the intent that generated this reply
        // form_reply.message.attributes.intent_display_name = faq.intent_display_name;
        // form_reply.message.attributes.intent_id = faq.intent_id;
        // return form_reply.message
      }
    }
    // FORM END
  }

  async #executeCondition(result, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, callback) {
    let trueIntentDirective = null;
    if (trueIntent) {
      trueIntentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
    }
    let falseIntentDirective = null;
    if (falseIntent) {
      falseIntentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
    }
    if (result === true) {
      if (trueIntentDirective) {
        this.intentDir.execute(trueIntentDirective, () => {
          callback();
        });
      }
      else {
        winston.debug("(DirForm) No trueIntentDirective specified");
        callback();
      }
    }
    else {
      if (falseIntentDirective) {
        this.intentDir.execute(falseIntentDirective, () => {
          callback();
        });
      }
      else {
        winston.debug("(DirForm) No falseIntentDirective specified");
        callback();
      }
    }
  }

}

module.exports = { DirForm };