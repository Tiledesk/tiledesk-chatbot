
class DirOfflineHours {

  constructor(tdclient) {
    // tdclient.openNow(callback) {
    if (!tdclient) {
      throw new Error('tdclient (TiledeskClient) object is mandatory.');
    }
    this.tdclient = tdclient;
  }

  execute(directive, pipeline, callback) {
    console.log("whenofflinehours...")
    let offline_reply = "We're sorry but we are closed right now";
    if (directive.parameter) {
      const params = directive.parameter.trim().split(" ");
      const params_for_message = directive.parameter.trim().split("\"");
      if (params_for_message.length >= 2) {
        offline_reply = params_for_message[1].replaceAll("\\n", "\n");
      }
      console.log("reply param:", offline_reply);
    }
    let message = pipeline.message;
    const original_text = message.attributes.intent_info.question_payload.text
    this.tdclient.openNow((err, result) => {
      console.log("whenofflinehours result...", result);
      if (err) {
        console.error("DirOfflineHours Error:", err);
      }
      else if (result) {
        console.log("whenofflinehoursSuccessfully got result", result);
        if (!result.isopen) {
          if (directive.replaceMessage) {
            pipeline.message.text = offline_reply;
          }
          else {
            pipeline.message.text = offline_reply + "\n\n" + pipeline.message.text;
          }
          
        }
        //pipeline.message.text = reply;
      }
      callback();
    });
  }
}

module.exports = { DirOfflineHours };