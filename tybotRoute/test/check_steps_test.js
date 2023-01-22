var assert = require('assert');
const { TiledeskChatbot } = require('../models/TiledeskChatbot.js');
const { MockTdCache } = require('../models/MockTdCache');
const { v4: uuidv4 } = require('uuid');

describe('checkStep()', function() {
  
  it('checkStep() function', async () => {
    const MAX_STEPS = 20;
    const requestId = uuidv4();
    const tdcache = new MockTdCache();
    let i;
    // trying to brute-pass MAX_STEPS limit by doubling it
    for (i = 0; i < MAX_STEPS * 2; i++) {
      console.log("i: " + i);
      let go_on = await TiledeskChatbot.checkStep(tdcache, requestId, MAX_STEPS);
      console.log("go on?", go_on);
      if (!go_on) {
        break;
      }
    }
    console.log("last i: " + i);
    assert(i === MAX_STEPS + 1);
  });
  
});