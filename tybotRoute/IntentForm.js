//const CURRENT_FIELD_K = "tilebot:requests:forms:currentField"; // form field index
const CURRENT_FORM_K = "CURRENT_FORM"; // form json

class IntentForm {

  constructor(options) {
    this.db = options.db;
    this.requestId = options.requestId;
    this.form = options.form;
    this.CURRENT_FIELD_INDEX_KEY = "tilebot:requests:" + this.requestId + ":currentFieldIndex"
    this.CURRENT_FORM_KEY = "tilebot:requests:" + this.requestId + ":currentForm"
  }

  async setValue(key, value) {
    let db_key = key; //this.requestId + ":"+ key;
    console.log("setting key:", db_key);
    console.log("setting value:", value);
    await this.db.set(db_key, value);
  }

  async getValue(key) {
    let db_key = key; //this.requestId + ":"+ key;
    console.log("getting key:", db_key);
    const value = await this.db.get(db_key);
    return value;
  }

  async delValue(key) {
    let db_key = key; //this.requestId + ":"+ key;
    console.log("removing key:", db_key);
    await this.db.del(db_key);
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
  async getMessage(user_text, intent_text) {
    let current_field = null;
    const _current_field = await this.getValue(this.CURRENT_FIELD_INDEX_KEY);
    console.log("_current_field", _current_field)
    if (_current_field) {
      current_field = Number(_current_field);
    }
    console.log("CURRENT FIELD VALUE:", current_field);
    //const FIELD_VALUE_K = current_field; // key:0 => value:"user text"
    let current_form = null;
    const _current_form = await this.getValue(this.CURRENT_FORM_KEY);
    if (_current_form) {
      current_form = JSON.parse(_current_form);
    }
    console.log("CURRENT FORM IS", current_form);
    if (current_field == null) {
      console.log("current_field is undefined");
      current_field = 0;
      await this.setValue(this.CURRENT_FORM_KEY, JSON.stringify(this.form));
      await this.setValue(this.CURRENT_FIELD_INDEX_KEY, current_field);
      //this.printdb();
      console.log("INTENT_FORM:", this.form);
      console.log("CURRENT FIELD:", current_field);
      let message = {
        text: this.form.fields[current_field].label
      }
      console.log("form reply message:", message);
      return message;
    }
    else {
      //console.log("current_form:", current_form);
      console.log("current_field:", current_field);
      
      if (current_form.fields[current_field].regex) {
        if (!this.validate(user_text, current_form.fields[current_field].regex)) {
          console.log("text is invalid");
          // send error message
          let error_reply_text = this.form.fields[current_field].label;
          console.log("text is invalid label", error_reply_text);
          if (current_form.fields[current_field].errorLabel) {
            console.log("text is invalid errorLabel", current_form.fields[current_field].errorLabel);
            error_reply_text = current_form.fields[current_field].errorLabel;
          }
          let message = {
            text: error_reply_text // Error
          }
          console.log("error message", message)
          return message;
        }
      }
      else {
        console.log("no regex validation requested. next field...");
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
      console.log("adding parameters, name:", parameter_name, "value:", parameter_value);
      await this.addParameter(this.requestId, parameter_name, parameter_value);
      console.log("next field...");

      current_field += 1;
      if (current_field === current_form.fields.length) {
        // Form completed!
        await this.delValue(this.CURRENT_FIELD_INDEX_KEY)
        await this.delValue(this.CURRENT_FORM_KEY)
        return null;
        /*let message = {
          text: intent_text //ex. "Form completed\n\\agent"
        }
        return message;*/
      }
      else {
        console.log("Processing next field:", current_field)
        await this.setValue(this.CURRENT_FIELD_INDEX_KEY, current_field);
        let message = {
          text: current_form.fields[current_field].label
        }
        return message;
      }
    }
  }

  async addParameter(requestId, parameter_name, parameter_value) {
    await this.db.hset("tilebot:requests:" + requestId + ":parameters", parameter_name, parameter_value);
  }
  
  validate(text, regex) {
    var _regex = regex.substring(1, regex.length-1);
    console.log(_regex);
    const rg = new RegExp(_regex, "g");
    return rg.test(text);
  }

  /*async printdb() {
    console.log("****** PRINT DB ***********************")
    const current_field_value = this.getValue("CURRENT_FIELD");
    console.log("Current edit field:", current_field_value);
    const form = await this.getValue("CURRENT_FORM");
    for (let i = 0; i < form.length; i++) {
      const field_id = i;
      console.log("field_id:", field_id);
      const field_value_key = field_id;
      console.log("field value key:", field_value_key);
      console.log("field value:", await this.getValue(field_value_key));
    }
    console.log("****** PRINT DB END ***********************");
  }*/

}

module.exports = { IntentForm };