class Directives {
  static AGENT = 'agent';
  static CLOSE = 'close';
  static DEPARTMENT = 'department';
  static MESSAGE = 'message';
  static HMESSAGE = 'hmessage';
  static INTENT = 'intent';
  static REMOVE_CURRENT_BOT = "removecurrentbot";
  static REPLACE_BOT = "replacebot";
  static ASSIGN = "assign"; // DEPRECATED
  static ASK_HELP_CENTER = "askhelpcenter";
  static WAIT = "wait";
  static LOCK_INTENT = "lockintent";
  static UNLOCK_INTENT = "unlockintent";
  static FIRE_TILEDESK_EVENT = "firetiledeskevent";
  static SEND_EMAIL = "email";
  static WEB_REQUEST = "webrequest";
  static WEB_REQUEST_V2 = "webrequestv2";
  static DELETE = "delete";
  static IF_OPEN_HOURS = "ifopenhours";
  static IF_ONLINE_AGENTS = "ifonlineagents";
  static FUNCTION_VALUE = "functionvalue";
  static JSON_CONDITION = "jsoncondition";
  static SET_ATTRIBUTE = "setattribute";
  static REPLY = 'reply';
  static RANDOM_REPLY = 'randomreply';
  static CODE = 'code';
  static WHATSAPP_ATTRIBUTE = 'whatsapp_attribute';
  static ASK_GPT = "askgpt";
  static GPT_TASK = "gpt_task";
  static FORM = "form";
  static CAPTURE_USER_REPLY = "capture_user_reply";
  static QAPLA = 'qapla';
  static MAKE = 'make';

  // static WHEN_ONLINE_MOVE_TO_AGENT = "whenonlinemovetoagent"; // DEPRECATED?
  // static WHEN_OFFLINE_HOURS = "whenofflinehours"; // DEPRECATED // adds a message on top of the original message when offline hours opts: --replace
  //static WHEN_OFFLINE_HOURS_REPLACE_MESSAGE = "whenofflinehoursreplacemessage"; // REMOVE
  // static DISABLE_INPUT_TEXT = "disableinputtext"; // DEPRECATED
  // static WHEN_OPEN = "whenopen"; // DEPRECATED
  // static WHEN_CLOSED = "whenclosed"; // DEPRECATED
  // static IF_NO_AGENTS = "ifnoagents"; // DEPRECATED
  // static IF_AGENTS = "ifagents"; // DEPRECATED
  // static WHEN_NO_AVAILABLE_AGENTS = "whennoavailableagents"; // DEPRECATED
  // static JSONMESSAGE = 'jsonmessage'; // DEPRECATED?
  // static IF_NOT_OPEN_HOURS = "ifnotopenhours"; // DEPRECATED
  // static CONDITION = "condition"; // DEPRECATED

  static actionToDirective(action) {
    // console.log("actionToDirective:", action);
    let directive = {
      name: action["_tdActionType"],
      action: action
    }
    // delete directive.action["_tdActionType"];
    // console.log("Directive out:", directive);
    return directive;
  }
}

module.exports = { Directives };