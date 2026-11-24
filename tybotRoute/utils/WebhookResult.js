'use strict';

// Fills the result slot the server creates for a sync conversation webhook.
// tybot never creates a slot and never changes its TTL.

const RESULT_PREFIX = 'webhook:result:';

// Byte-identical to FINISH_IF_PENDING_LUA in tiledesk-server/services/webhookResultService.js
const CAS_SCRIPT = `-- KEYS[1] slot; ARGV field/value pairs. Writes only while state is 'pending'.
if redis.call('HGET', KEYS[1], 'state') == 'pending' then
  redis.call('HSET', KEYS[1], unpack(ARGV))
  return 1
end
return 0`;

function maxBytes() {
  const n = parseInt(process.env.WEBHOOK_RESULT_MAX_BYTES, 10);
  return n >= 0 ? n : 1048576;
}

async function writeIfPending(client, requestId, fields) {
  const args = [];
  for (const [k, v] of Object.entries(fields)) {
    args.push(k, String(v));
  }
  const res = await client.eval(CAS_SCRIPT, { keys: [RESULT_PREFIX + requestId], arguments: args });
  return res === 1;
}

async function completeIfPending(client, requestId, { status, payload } = {}) {
  const n = parseInt(status, 10);
  const fields = {
    state: 'completed',
    status: Number.isNaN(n) ? 200 : n,
    updated_at: new Date().toISOString()
  };
  const json = JSON.stringify(payload === undefined ? null : payload);
  if (Buffer.byteLength(json) > maxBytes()) {
    fields.payload_too_large = 'true';
  } else {
    fields.payload = json;
  }
  return writeIfPending(client, requestId, fields);
}

async function finishIfPending(client, requestId, state, extra = {}) {
  const fields = { state, updated_at: new Date().toISOString() };
  if (extra.replaced_by) fields.replaced_by = extra.replaced_by;
  return writeIfPending(client, requestId, fields);
}

module.exports = { completeIfPending, finishIfPending, RESULT_PREFIX, CAS_SCRIPT };
