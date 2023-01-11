const ms = require('minimist-string');

class DirOfflineHours {

  constructor(tdclient) {
    if (!tdclient) {
      throw new Error('tdclient (TiledeskClient) object is mandatory.');
    }
    this.tdclient = tdclient;
  }

  execute(directive, pipeline, callback) {
    console.log("whenofflinehours...pipeline");//, JSON.stringify(pipeline))
    let offline_reply = "**We're sorry but we are closed right now**";
    if (directive.parameter) {
      const options = this.parseParams(directive.parameter);
      console.log("Options", options)
      directive.options = options;
      if (options.message) {
        console.log("options.message", options.message)
        offline_reply = options.message;
        this.reply(pipeline, directive, offline_reply, callback);
      }
      else if (options.intentreply) {
        // SECOND: try intent static reply
        const intent_display_name = options.intentreply;
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
    else {
      this.reply(pipeline, directive, offline_reply, callback);
    }
  }

  reply(pipeline, directive, offline_reply, callback) {
    let message = pipeline.message;
    console.log("message in pipeline:", JSON.stringify(message));
    //const original_text = message.attributes.intent_info.question_payload.text
    this.tdclient.openNow((err, result) => {
      console.log("whenofflinehours result...", result);
      if (err) {
        console.error("DirOfflineHours Error:", err);
      }
      else if (result) {
        console.log("whenofflinehoursSuccessfully got result", result);
        if (!result.isopen) {
          if (directive.options.replace) {
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

  parseParams(directive_parameter) {
    let intentreply = null;
    let message = null;
    let replace = false;
    const params = ms(directive_parameter);
    // console.log("params:", params)
    
    if (params.m) {
      //console.log("_param m", params.m)
      message = params.m.replace(/\\n/g, "\n");
    }
    if (params.message) {
      //console.log("_param message", params.message)
      message = params.message.replace(/\\n/g, "\n");
    }

    if (params.ir) {
      //console.log("_param m", params.m)
      intentreply = params.ir;
    }
    if (params["intentreply"]) {
      //console.log("_param message", params.message)
      intentreply = params.intentreply;
    }

    if (params.replace) {
      replace = true;
    }
    if (params.r) {
      replace = true;
    }
    
    return {
      intentreply: intentreply,
      message: message,
      replace: replace
    }
  }
}

module.exports = { DirOfflineHours };