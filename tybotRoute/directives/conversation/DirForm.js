const { Filler } = require('../../variables/Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { DirIntent } = require('../flow/DirIntent');
const { IntentForm } = require('../../engine/IntentForm.js');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../utils/winston');
const { BaseDirective } = require('../BaseDirective');
const { Directives } = require('../Directives');

class DirForm extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.FORM];
  constructor(context) {
    super(context);
    this.chatbot = context.chatbot;
    this.log = context.log;

    this.intentDir = new DirIntent(context);
    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___", log: this.log });
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
    const trueIntentAttributes = action.trueIntentAttributes;
    const falseIntentAttributes = action.falseIntentAttributes;
    let form = action.form;
    winston.debug("(DirForm) IntentForm.isValidForm(intent_form) " + IntentForm.isValidForm(form));

    if (!IntentForm.isValidForm(form)) {
      // Without this the whole body was skipped and `callback` was never
      // called, so the directive pipeline stopped for good and the
      // conversation hung with no reply and no log.
      this.logger.error("[Form] Invalid form");
      winston.warn("(DirForm) Invalid form: ", form);
      callback();
      return;
    }

    await this.chatbot.lockAction(this.requestId, action.action_id);

    // The user's answer to the field asked last time round.
    const user_reply = this.context.message ? this.context.message.text : null;

    // IntentForm uses exactly two capabilities of the object it is given as
    // `chatbot`: `tdcache` (its key/value store) and `addParameter`. The cache
    // comes from this directive's own context, as in every other directive.
    const requestParameters = await TiledeskChatbot.allParametersStatic(this.tdcache, this.requestId);
    const intentForm = new IntentForm({
      form: form,
      requestId: this.requestId,
      chatbot: {
        tdcache: this.tdcache,
        addParameter: (key, value) => this.chatbot.addParameter(key, value)
      },
      requestParameters: requestParameters
    });
    const form_reply = await intentForm.getMessage(user_reply);

    if (!form_reply.canceled && form_reply.message) {
      winston.debug("(DirForm) Sending form reply...", form_reply.message)
      // reply with this message (ex. please enter your fullname)
      if (!form_reply.message.attributes) {
        form_reply.message.attributes = {}
      }
      form_reply.message.attributes.fillParams = true;
      form_reply.message.attributes.splits = true;
      form_reply.message.attributes.markbot = true;

      this.tdClient.sendSupportMessage(
        this.requestId,
        form_reply.message,
        (err) => {
          if (err) {
            winston.error("(DirForm) Error sending form reply: " + err.message);
          }
          winston.debug("(DirForm) Form reply message sent.");
          callback(true); // stop the flow: the form waits for the answer
      });
    }
    else if (form_reply.end) {
      winston.debug("(DirForm) FORM end.");
      winston.debug("(DirForm) unlocking action for request: " + this.requestId);
      await this.chatbot.unlockAction(this.requestId);

      this._executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
        callback(false); // continue the flow
      });
    }
    else {
      winston.debug("(DirForm) unlocking action due to canceling, for request " + this.requestId);
      await this.chatbot.unlockAction(this.requestId);

      this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
        callback(false); // continue the flow
      });
    }
    // FORM END
  }

}

module.exports = { DirForm };