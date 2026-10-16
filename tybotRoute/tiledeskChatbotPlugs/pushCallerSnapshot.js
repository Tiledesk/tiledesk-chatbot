const jwt = require('jsonwebtoken');
const winston = require('../utils/winston');
const { SubagentStack } = require('./SubagentStack');

// The bot JWT is signed for the bot that is a participant of the request. After a publish
// that is the development bot, while chatbot.botId is the published copy running the flow.
function participantBotIdFromToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const raw = token.startsWith('JWT ') ? token.slice(4) : token;
  const payload = jwt.decode(raw);
  if (!payload || payload.sub !== 'bot' || !payload._id) {
    return null;
  }
  return String(payload._id);
}

// Saves the caller before handing the request to another bot, so a later
// returnstack can restore it. Used by callsubagent and every replace.
async function pushCallerSnapshot(context, label, extra) {
  const subagentStack = new SubagentStack({ tdCache: context.tdcache });
  const intentAction = context.reply.actions.find(action => action._tdActionType === "intent");
  const parentId = context.chatbot?.botId;
  const parentParticipantId = participantBotIdFromToken(context.token) || parentId;

  winston.debug("(" + label + ") push " + JSON.stringify({
    requestId: context.requestId,
    parentId: parentId,
    parentParticipantId: parentParticipantId,
    ...(extra || {}),
    nextBlock: intentAction && intentAction.intentName
  }));

  const stackData = {
    parentId: parentId,
    parentParticipantId: parentParticipantId,
    parentToken: context.token,
    nextBlock: intentAction
  };
  await subagentStack.push(context.requestId, stackData);
  return { subagentStack, nextBlock: intentAction || null };
}

module.exports = { participantBotIdFromToken, pushCallerSnapshot };
