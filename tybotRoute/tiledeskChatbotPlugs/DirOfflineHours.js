
class DirOfflineHours {

  constructor(tdclient) {
    // tdclient.openNow(callback) {
    if (!tdclient) {
      throw new Error('tdclient (TiledeskClient) object is mandatory.');
    }
    this.tdclient = tdclient;
  }

  execute(directive, pipeline, callback) {
    console.log("whenofflinehours...pipeline");//, JSON.stringify(pipeline))
    let offline_reply = "**We're sorry but we are closed right now**";
    if (directive.parameter) {
      //const params = directive.parameter.trim().split(" ");
      // FIRST: try string in commas
      const params_for_message = directive.parameter.trim().split("\"");
      if (params_for_message.length >= 2) {
        offline_reply = params_for_message[1].replaceAll("\\n", "\n");
        console.log("FIRST: try string in commas. OK")
        this.reply(pipeline, directive, offline_reply, callback);
      }
      else {
        // SECOND: try intent static reply
        const params_for_intent_message = directive.parameter.trim().split("reply_with:");
        if (params_for_intent_message.length >= 2) {
          console.log("params_for_intent_message[1]:", params_for_intent_message[1]);
          const intent_display_name = params_for_intent_message[1].trim();
          console.log("SECOND: try reply_with:intent_display_name. OK. intent_display_name", intent_display_name);
          const botId = pipeline.context.payload.botId;
          console.log("botId:", botId)
          this.tdclient.getIntents(botId, intent_display_name, 0, 0, null, (err, faqs) => {
            console.log("got faqs:", faqs);
            if (faqs && faqs.length > 0 && faqs[0].answer) {
              console.log("faqs[0].answer OK", faqs[0].answer);
              this.reply(pipeline, directive, faqs[0].answer, callback);
            }
            else {
              console.log("No faqs[0].answer");
              this.reply(pipeline, directive, offline_reply, callback);
            }
          });
        }
        else {
          // THIRD: use standard offline reply
          console.log("THIRD: use standard offline reply. OK")
          this.reply(pipeline, directive, offline_reply, callback);
        }
      }
    }
    else {
      this.reply(pipeline, directive, offline_reply, callback);
    }
  }

  reply(pipeline, directive, offline_reply, callback) {
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