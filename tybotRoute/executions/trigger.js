'use strict';

const START_TYPES = ['scheduled', 'webhook', 'trigger'];

// automation-request-{project}-{ObjectId}-{webhook_id} (the server's webhookService.run). A block run
// without a webhook is automation-request-{project}-{uuid}: no match, source_id stays null.
const AUTOMATION_REQUEST_RE = /^automation-request-[^-]+-[0-9a-f]{24}-([A-Za-z0-9_-]{1,64})$/;

function automationWebhookId(requestId) {
  const m = AUTOMATION_REQUEST_RE.exec(requestId);
  return m ? m[1] : null;
}

/**
 * What started a conversation or a run: {type, source_id, start_point_id}.
 * agentId (the root id): source_id of a scheduled run that names no webhook or chatbot.
 * Pure, never throws on missing fields.
 */
function detectTrigger(message, requestId, botId, agentId) {
  const request = (message && message.request) || {};
  const attributes = request.attributes || {};
  const action = message && message.attributes && message.attributes.action;
  const start_point_id = typeof action === 'string' && action ? action.replace(/^#/, '') : null;

  if (typeof requestId === 'string' && requestId.startsWith('automation-request-')) {
    return { type: 'automation', source_id: automationWebhookId(requestId), start_point_id };
  }
  if (START_TYPES.includes(attributes.start_type)) {
    const fallback = attributes.start_type === 'scheduled' ? (agentId || null) : null;
    return { type: attributes.start_type, source_id: attributes.webhook_id || attributes.chatbot_id || fallback, start_point_id };
  }
  const channel = request.channel && request.channel.name;
  if (channel && channel !== 'chat21') {
    return { type: 'channel', source_id: channel, start_point_id };
  }
  return { type: 'widget', source_id: null, start_point_id };
}

module.exports = { detectTrigger };
