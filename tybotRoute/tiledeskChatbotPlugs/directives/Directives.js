class Directives {
  static AGENT = 'agent';
  static WHEN_ONLINE_MOVE_TO_AGENT = "whenonlinemovetoagent"; // DEPRECATED?
  static CLOSE = 'close';
  static DEPARTMENT = 'department';
  static JSONMESSAGE = 'jsonmessage'; // DEPRECATED?
  static MESSAGE = 'message';
  static HMESSAGE = 'hmessage';
  static INTENT = 'intent';
  static REMOVE_CURRENT_BOT = "removecurrentbot";
  static REPLACE_BOT = "replacebot";
  static WHEN_NO_AVAILABLE_AGENTS = "whennoavailableagents"; // DEPRECATED
  static WHEN_OFFLINE_HOURS = "whenofflinehours"; // DEPRECATED // adds a message on top of the original message when offline hours opts: --replace
  //static WHEN_OFFLINE_HOURS_REPLACE_MESSAGE = "whenofflinehoursreplacemessage"; // REMOVE
  static DISABLE_INPUT_TEXT = "disableinputtext"; // DEPRECATED
  static WHEN_OPEN = "whenopen"; // DEPRECATED
  static WHEN_CLOSED = "whenclosed"; // DEPRECATED
  static IF_NO_AGENTS = "ifnoagents"; // DEPRECATED
  static IF_AGENTS = "ifagents"; // DEPRECATED

  static DEFLECT_TO_HELP_CENTER = "deflecttohelpcenter";
  static WAIT = "wait";
  static LOCK_INTENT = "lockintent";
  static UNLOCK_INTENT = "unlockintent";
  static FIRE_TILEDESK_EVENT = "firetiledeskevent";
  static SEND_EMAIL = "email";
  static WEB_REQUEST = "webrequest";
  static DELETE = "delete";
  static IF_OPEN_HOURS = "ifopenhours";
  static IF_ONLINE_AGENTS = "ifonlineagents";
  static IF_NOT_OPEN_HOURS = "ifnotopenhours"; // DEPRECATED
  static FUNCTION_VALUE = "functionvalue";
  static CONDITION = "condition";
  static JSON_CONDITION = "jsoncondition";
  static ASSIGN = "assign";
  static SET_ATTRIBUTE = "setattribute";
  // static IF_AVAILABLE_AGENTS = "ifavailableagents"; // TODO
  // static IF_NO_AVAILABLE_AGENTS = "ifnotavailableagents"; // TODO
  static REPLY = 'reply';

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