class Directives {
  static AGENT = 'agent';
  static CLOSE = 'close';
  static DEPARTMENT = 'department';
  static MESSAGE = 'message'; // DEPRECATED
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
  static SET_ATTRIBUTE_V2 = "setattribute-v2";
  static REPLY = 'reply';
  static RANDOM_REPLY = 'randomreply';
  static CODE = 'code';
  static WHATSAPP_ATTRIBUTE = 'whatsapp_attribute';
  static SEND_WHATSAPP = 'send_whatsapp';
  static FORM = "form";
  static CAPTURE_USER_REPLY = "capture_user_reply";
  static REPLACE_BOT_V2 = "replacebotv2";
  static REPLACE_BOT_V3 = "replacebotv3";
  static ITERATION = "iteration";
  /**** AI ****/
  static ASK_GPT = "askgpt";
  static ASK_GPT_V2 = "askgptv2";
  static GPT_TASK = "gpt_task";
  static AI_PROMPT = "ai_prompt";
  static AI_CONDITION = "ai_condition";
  /**** INTEGRATIONS ****/
  static QAPLA = 'qapla';
  static MAKE = 'make';
  static HUBSPOT = 'hubspot';
  static CUSTOMERIO = 'customerio';
  static BREVO = 'brevo';
  /**** VOICE CHANNEL ****/
  static DTMF_FORM = 'dtmf_form';
  static DTMF_MENU = 'dtmf_menu';
  static BLIND_TRANSFER = 'blind_transfer';
  static SPEECH_FORM = 'speech_form';
  static PLAY_PROMPT = 'play_prompt';
  static AUDIO_RECORD = 'audio_record';
  static GPT_ASSISTANT = 'gpt_assistant';
  static REPLY_V2 = 'replyv2';
  static IF_ONLINE_AGENTS_V2 = "ifonlineagentsv2";
  static CONTACT_UPDATE = "leadupdate";
  static CLEAR_TRANSCRIPT = "clear_transcript";
  static MOVE_TO_UNASSIGNED = "move_to_unassigned";
  static CONNECT_BLOCK = "connect_block";
  static ADD_TAGS = 'add_tags'
  static WEB_RESPONSE = "web_response";
  static FLOW_LOG = "flow_log";
  static ADD_KB_CONTENT = "add_kb_content";

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
    let directive = {
      name: action["_tdActionType"],
      action: action
    }
    return directive;
  }
}

module.exports = { Directives };