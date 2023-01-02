class Directives {
  static AGENT = 'agent';
  static WHEN_ONLINE_MOVE_TO_AGENT = "whenonlinemovetoagent";
  static CLOSE = 'close';
  static DEPARTMENT = 'department';
  static JSONMESSAGE = 'jsonmessage';
  static MESSAGE = 'message';
  static HMESSAGE = 'hmessage';
  static INTENT = 'intent';
  static REMOVE_CURRENT_BOT = "removecurrentbot";
  static REPLACE_BOT = "replacebot";
  static WHEN_NO_AVAILABLE_AGENTS = "whennoavailableagents";
  static WHEN_OFFLINE_HOURS = "whenofflinehours"; // adds a message on top of the original message when offline hours opts: --replace
  //static WHEN_OFFLINE_HOURS_REPLACE_MESSAGE = "whenofflinehoursreplacemessage"; // REMOVE
  static DISABLE_INPUT_TEXT = "disableinputtext";
  static WHEN_OPEN = "whenopen";
  static WHEN_CLOSED = "whenclosed";
  static IF_NO_AGENTS = "ifnoagents";
  static IF_AGENTS = "ifagents";
  static DEFLECT_TO_HELP_CENTER = "deflecttohelpcenter";
  static WAIT = "wait";
  static LOCK_INTENT = "lockintent";
  static UNLOCK_INTENT = "unlockintent";
  static FIRE_TILEDESK_EVENT = "firetiledeskevent";
  static SEND_EMAIL = "sendemail";
  static DELETE = "delete";

  static actionToDirective(action) {
    let directive = {
      name: action.type,
      action: action
    }
    return directive;
  }
}

module.exports = { Directives };