// Runs TiledeskChatbotUtil.updateRequestAttributes with a fake chatbot and records,
// in order, every attribute it writes (addParameter) and deletes (deleteParameter).
const { TiledeskChatbotUtil } = require('../../utils/TiledeskChatbotUtil');

const ENV = { BASE_URL: 'https://base.test.local', API_URL: 'https://api.test.local' };

async function runUpdateRequestAttributes(message) {
  const saved = {};
  for (const k of Object.keys(ENV)) { saved[k] = process.env[k]; process.env[k] = ENV[k]; }
  const added = [];
  const deleted = [];
  const chatbot = {
    bot: { _id: 'bot1', name: 'Test bot', attributes: { globals: [{ key: 'global_one', value: 'G1' }] } },
    addParameter: async (k, v) => { added.push([k, v]); },
    deleteParameter: async (k) => { deleted.push(k); },
    getParameter: async () => undefined
  };
  try {
    // the function changes message.attributes (payload): work on a copy
    await TiledeskChatbotUtil.updateRequestAttributes(chatbot, 'tok', JSON.parse(JSON.stringify(message)), 'project1', 'support-group-p1-r1');
  } finally {
    for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
  return { added, deleted };
}

module.exports = { runUpdateRequestAttributes };
