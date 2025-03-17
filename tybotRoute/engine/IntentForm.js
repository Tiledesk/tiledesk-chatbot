//const CURRENT_FIELD_K = "tilebot:requests:forms:currentField"; // form field index
const CURRENT_FORM_K = "CURRENT_FORM"; // form json
const winston = require('../utils/winston');

class IntentForm {

  constructor(options) {
    this.db = options.chatbot.tdcache;
    this.chatbot = options.chatbot;
    this.requestId = options.requestId;
    this.form = options.form;
    this.CURRENT_FIELD_INDEX_KEY = "tilebot:requests:" + this.requestId + ":currentFieldIndex"
    this.CURRENT_FORM_KEY = "tilebot:requests:" + this.requestId + ":currentForm"
    this.log = options.log;
    this.requestParameters = options.requestParameters;
  }

  getParam(paramKey) {
    if (!this.requestParameters) {
      return null;
    }
    winston.debug("(IntentForm) requestParameters: ", this.requestParameters);
    winston.debug("(IntentForm) requestParameters[" + paramKey + "]:" + this.requestParameters[paramKey]);
    return this.requestParameters[paramKey];
  }

  async setValue(key, value) {
    await this.db.set(key, value);
  }

  async getValue(key) {
    const value = await this.db.get(key);
    return value;
  }

  async delValue(key) {
    await this.db.del(key);
  }

  /**
    intent_text: Used to send final text when the form is completed.
    example form schema
    the_form = {
      "name": "form_name",
      "id": "form_id",
      "fields": [
        {
          "name": "userFullname",
          "type": "text",
          "label": "Your name"
        },
        {
          "name": "userEmail",
          "type": "text",
          "regex": "/^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/",
          "label": "Your email",
          "errorLabel": "Invalid email address"
        }
      ]
    }
  */
  async getMessage(user_text) {
    let current_form = null;
    const _current_form = await this.getValue(this.CURRENT_FORM_KEY);
    if (_current_form) {
      current_form = JSON.parse(_current_form);
    }
    if (
    current_form &&
    this.form &&
    this.form.cancelCommands &&
    this.form.cancelCommands.includes(user_text.toLowerCase())) {
      const cancelReply = this.form.cancelReply ? this.form.cancelReply : "Canceled"
      await this.delValue(this.CURRENT_FIELD_INDEX_KEY)
      await this.delValue(this.CURRENT_FORM_KEY)
      return {
        canceled: true,
        message: {
          text: cancelReply
        }
      };
    }
    let current_field = null;
    const _current_field = await this.getValue(this.CURRENT_FIELD_INDEX_KEY);
    if (_current_field) {
      current_field = Number(_current_field);
    }
    
    if (current_field == null) {
      winston.debug("(IntentForm) current_field is undefined");
      current_field = 0;
      
      // first "freeze" the currente form, so that eventual form modifications
      // do not compromise this form processing.
      await this.setValue(this.CURRENT_FORM_KEY, JSON.stringify(this.form));

    //   if (getParam(this.form.fields[current_field].name)) {
    //     //current_field++;
    //     await this.setValue(this.CURRENT_FIELD_INDEX_KEY, current_field); //=0
    //     return this.getMessage(current_value)
    //   }
      // set the first field under the "await the response-value" state (=0)
      await this.setValue(this.CURRENT_FIELD_INDEX_KEY, current_field);
      // now look for an already set value for this field in request parameters
      winston.debug("(IntentForm) parameters ", this.requestParameters);
      winston.debug("(IntentForm) checking field: " + this.form.fields[current_field].name);
      const is_current_value = this.getParam(this.form.fields[current_field].name);
      if (is_current_value) {
        winston.debug("(IntentForm) is_current_value: " + is_current_value);
        return await this.getMessage(is_current_value);
      }
      winston.debug("(IntentForm) asking fist value. No 'is_current_value' for first form field" + is_current_value);
      winston.debug("(IntentForm) current_field: " + current_field);
      let message = {
        text: this.form.fields[current_field].label
      }
      winston.debug("(IntentForm)form reply message: ", message);
      return {
        message: message
      }
    }
    else {

      winston.debug("(IntentForm) current_field: " + current_field);
      
      if (current_form.fields[current_field].regex) {
        if (!this.validate(user_text, current_form.fields[current_field].regex)) {
          winston.verbose("(IntentForm) text is invalid");
          // send error message
          let error_reply_text = this.form.fields[current_field].label;
          winston.debug("(IntentForm) text is invalid label: " + error_reply_text);
          if (current_form.fields[current_field].errorLabel) {
            winston.debug("(IntentForm) text is invalid errorLabel: " + current_form.fields[current_field].errorLabel);
            error_reply_text = current_form.fields[current_field].errorLabel;
          }
          let message = {
            text: error_reply_text // Error
          }
          winston.debug("(IntentForm) error message: ", message);
          return {
            message: message
          };
        }
      }
      else {
        winston.verbose("(IntentForm) no regex validation requested. next field...")
      }
      
      // text ok?
      //   y: set value for current_field = text
      //.     inc current_field, send message[current_field]
      //.  n: send error message => error[current_field]
      //.     no inc, no changes in status
      //await this.setValue(FIELD_VALUE_K, user_text);

      // persist parameter
      const parameter_name = current_form.fields[current_field].name;
      const parameter_value = user_text;
      winston.debug("(IntentForm) adding parameters, name: " + parameter_name + " value: " + parameter_value)
      await this.chatbot.addParameter(parameter_name, parameter_value);
      if (current_form.fields[current_field].type) { // adding type
        await this.chatbot.addParameter("_tdTypeOf:" + parameter_name, current_form.fields[current_field].type);
      }
      winston.verbose("(IntentForm) next field...");

      current_field += 1;
      if (current_field === current_form.fields.length) {
        // Form completed!
        await this.delValue(this.CURRENT_FIELD_INDEX_KEY)
        await this.delValue(this.CURRENT_FORM_KEY)
        return {
          end: true
        };
      }
      else {
        winston.debug("(IntentForm) Processing next field: " + current_field);
        await this.setValue(this.CURRENT_FIELD_INDEX_KEY, current_field);

        winston.debug("(IntentForm)checking field:", this.form.fields[current_field].name);
        
        const is_current_value = this.getParam(this.form.fields[current_field].name);
        if (is_current_value) {
          winston.debug("(IntentForm) is_current_value! " + is_current_value);
          return await this.getMessage(is_current_value);
        }
        else {
          return {
            message: {
              text: current_form.fields[current_field].label
            }
          };
        }
        
      }
    }
  }
  
  validate(text, regex) {
    let _regex = regex;
    if (regex.startsWith("/")) {
      // removing leading and trailing / if regex is sorrounded by (legacy support, to be removed)
      _regex = regex.substring(1, regex.length-1);
    }
    winston.debug("(IntentForm)Validating using regex: " + _regex);
    try {
      const rg = new RegExp(_regex, "g");
      return rg.test(text);
    }
    catch(error) {
      winston.error("(IntentForm) Error, invalid regex: " + _regex);
      return true;
    }
    
  }

  static isValidForm(form) {
    let is_valid = true;
    if (!form) {
      is_valid = false;
    }
    else if (form && !form.fields) {
      is_valid = false;
    }
    else if (form && form.fields.length === 0) {
      is_valid = false;
    }
    return is_valid;
  }

}

module.exports = { IntentForm };