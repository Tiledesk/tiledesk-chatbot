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
  static CHANGE_BOT = "changebot";
  static WHEN_NO_AVAILABLE_AGENTS = "whennoavailableagents";
  static WHEN_OFFLINE_HOURS = "whenofflinehours";
  static WHEN_OFFLINE_HOURS_REPLACE_MESSAGE = "whenofflinehoursreplacemessage";
  static DEFLECT_TO_HELP_CENTER = "deflecttohelpcenter";
  static WAIT = "wait";
}

module.exports = { Directives };