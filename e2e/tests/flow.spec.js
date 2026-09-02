'use strict';
/**
 * Walk the full flow validation bot in a real browser, against a real Tiledesk.
 *
 * One test per family, run in order in one browser, one conversation at a time.
 * Each test types a block's command into the CDS tester and waits for a line
 * that only that block says.
 *
 * The commands and the expected lines are read from
 * `examples/full-flow-validation-bot.json` -- the file the bot was imported
 * from -- so this suite says nothing about the flow that the flow does not say
 * about itself. If the deployed bot is older than that file, the mismatch is
 * the finding.
 *
 * What a pass means: the block ran and the conversation carried on. Not which
 * branch it took -- a vendor or LLM block with no key configured on the project
 * answers from its false connector, which is still the directive working.
 */
const { test, expect } = require('@playwright/test');
const config = require('../config');
const { authenticate, openCds } = require('../lib/session');
const { openTester, restart } = require('../lib/tester');
const { build } = require('../lib/flow-map');

const map = build();

/**
 * The blocks that ask the user something. The flow cannot go on until it is
 * answered, so the walk answers it. Everything else is one turn.
 */
const FOLLOW_UPS = {
  a_replyv2: ['red'],                               // pick one of the buttons
  a_voice: ['1'],                                   // the dtmf menu wants a digit
  d_capture_reply: ['green'],                       // capture_user_reply stores this
  d_form: ['Ada Lovelace', 'ada@example.com'],      // the form's two fields
  b_lock: ['anything at all']                       // lockintent routes this to unlock
};

/** Filled in as the walk goes, printed at the end. */
const outcomes = [];

test.describe.configure({ mode: 'serial' });

let page;
let tester;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
  await authenticate(context);
  page = await context.newPage();
  page.on('pageerror', (e) => console.log(`  [page error] ${e.message}`));
  await openCds(page, config.cdsBlocksUrl);
  tester = await openTester(page);
});

test.afterAll(async () => {
  if (outcomes.length) {
    console.log('\n  block                     took');
    for (const o of outcomes) {
      console.log(`  ${o.block.padEnd(24)}  ${o.matched || '(no line to match on)'}`);
    }
  }
  if (page) await page.context().close();
});

/** Type a command and wait for the line that proves the block ran. */
async function drive(block) {
  const before = await tester.transcript();
  await tester.send(block.command);

  for (const answer of (FOLLOW_UPS[block.name] || [])) {
    // The block asks something first; give the bot a moment to ask it, then
    // answer. Its reply is posted before the flow is ready for the next turn.
    await tester.waitForAnyReply({ since: before, timeout: config.REPLY_TIMEOUT });
    await page.waitForTimeout(1200);
    await tester.send(answer);
  }

  if (block.expected.length) {
    const matched = await tester.waitForAny(block.expected);
    outcomes.push({ block: block.command, matched });
    return matched;
  }

  // Nothing this block says is a fixed string -- a help centre answer, an event
  // that is fired silently. All that can be asserted is that it did not break
  // the conversation, which the next command proves.
  const grew = await tester.waitForAnyReply({ since: before, timeout: 15000 });
  outcomes.push({ block: block.command, matched: grew ? '(answered)' : '(silent, by design)' });
  return null;
}

/** Back to the top. Every block is addressable, so this always works. */
async function toMainMenu() {
  await tester.send(map.start.command);
  await tester.waitForAny(map.start.expected.length ? map.start.expected
    : map.families.map((f) => f.command));
}

test('the tester opens and the bot answers /start with all nine families', async () => {
  await tester.send(map.start.command);
  await tester.waitForAny(map.start.expected);
  const transcript = await tester.transcript();
  for (const family of map.families) {
    expect(transcript, `the main menu must offer ${family.command}`)
      .toContain(family.command);
  }
});

for (const family of map.families) {
  test(`${family.command} - ${family.blocks.length} blocks`, async () => {
    await toMainMenu();
    await tester.send(family.command);
    await tester.waitForAny(family.expected);

    const menu = await tester.transcript();
    for (const block of family.blocks) {
      expect(menu, `${family.command} must offer ${block.command}`).toContain(block.command);
    }

    for (const block of family.blocks) {
      await test.step(`${block.command} (${block.actions.join(', ') || 'text directive'})`,
        async () => {
          await drive(block);
          // A terminal block will not answer this conversation again -- anything
          // typed after it would time out against a conversation that is over --
          // so the next block needs a fresh one.
          if (block.terminal) tester = await restart(page);
          await toMainMenu();
          await tester.send(family.command);
          await tester.waitForAny(family.expected);
        });
    }
  });
}
