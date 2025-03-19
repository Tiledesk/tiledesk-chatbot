var assert = require('assert');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot');
const { MockTdCache } = require('../engine/mock/MockTdCache');
const { v4: uuidv4 } = require('uuid');

describe('checkStep()', function() {
  
  it('checkStep() function', async () => {
    const MAX_STEPS = 20;
    const MAX_EXECUTION_TIME = 4000;
    const requestId = uuidv4();
    const tdcache = new MockTdCache();
    let i;
    // trying to brute-pass MAX_STEPS limit by doubling it
    for (i = 0; i < MAX_STEPS * 2; i++) {
      let go_on = await TiledeskChatbot.checkStep(tdcache, requestId, MAX_STEPS, MAX_EXECUTION_TIME, false);
      if (go_on.error) {
        break;
      }
    }
    assert(i === MAX_STEPS);
  });
  
});