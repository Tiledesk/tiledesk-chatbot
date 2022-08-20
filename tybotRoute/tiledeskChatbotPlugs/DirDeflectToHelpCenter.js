const { HelpCenter } = require('./HelpCenter');

class DirDeflectToHelpCenter {

  constructor(helpcenter) {
    if (!helpcenter) {
      throw new Error('helpcenter object is mandatory.');
    }
    this.helpcenter = helpcenter;
  }

  execute(directive, pipeline, maxresults, callback) {
    let workspace_id = null;
    let hc_reply = "No matching reply but...\n\nI found something interesting in the Help Center 🧐\n\nTake a look 👇";
    if (directive.parameter) {
      const params = directive.parameter.trim().split(" ");
      if (params.length >= 1) {
        workspace_id = params[0];
      }
      const params_for_message = directive.parameter.trim().split("\"");
      if (params_for_message.length >= 2) {
        hc_reply = params_for_message[1].replaceAll("\\n", "\n");
      }
      console.log("workspace_id param:", workspace_id);
      console.log("hc_reply param:", hc_reply);
    }
    let message = pipeline.message;
    console.log("help center message", JSON.stringify(message));
    const original_text = message.attributes.intent_info.question_payload.text
    if (original_text && original_text.trim() != '') {
      this.helpcenter.search(original_text, maxresults, (err, results) => {
        if (err) {
          console.error("deflectToHelpCenter Error:", err);
        }
        else if (results && results.length > 0) {
          console.log("Successfully got results", results);
          pipeline.message.text = hc_reply;
          results.forEach(content => {
            if (content.url.charAt(content.url.length -1) != "/") {
                content.url = content.url + "/"
            }
            pipeline.message.text += "\n* " + content.title + " > " + content.url;
          });
        }
        callback();
        //process(nextDirective());
      });
    }
    else {
      callback();
      //process(nextDirective());
    }
  }
}

module.exports = { DirDeflectToHelpCenter };