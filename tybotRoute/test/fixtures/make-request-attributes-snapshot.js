// Writes request-attributes-snapshot.json: what updateRequestAttributes produces for each
// message of request-attributes-messages.js. Run it ONLY on code whose behaviour is the
// reference (it was generated on main before lastUserAttachments was added):
//   node test/fixtures/make-request-attributes-snapshot.js
const fs = require('fs');
const path = require('path');
const messages = require('./request-attributes-messages');
const { runUpdateRequestAttributes } = require('../helpers/requestAttributesRunner');

(async () => {
  const out = {};
  for (const { id, message } of messages) {
    out[id] = await runUpdateRequestAttributes(message);
  }
  fs.writeFileSync(path.join(__dirname, 'request-attributes-snapshot.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('snapshot written for', Object.keys(out).length, 'messages');
  process.exit(0);
})();
