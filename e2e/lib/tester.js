'use strict';
/**
 * Driving the chat tester that the CDS opens next to the canvas.
 *
 * The tester is a widget, and a widget's markup is not a contract: class names
 * change between releases and it may or may not be inside an iframe. So nothing
 * here depends on a class name.
 *
 *   - the conversation is found by looking, in the page and in every frame, for
 *     something to type into next to something that accumulates text;
 *   - what the bot said is read as the panel's rendered text, and an assertion
 *     is "this line appeared", not "this node has this class".
 *
 * `npm run discover` prints what was found on your install, and every locator
 * below can be overridden by environment variable if the guess is wrong.
 */
const { expect } = require('@playwright/test');
const config = require('../config');

/** Things that open the tester, most specific first. */
const OPENERS = [
  '[data-testid*="test" i]',
  'button:has-text("Test")',
  'button:has-text("Simulate")',
  'button:has-text("Prova")',
  '[title*="test" i]',
  '[aria-label*="test" i]',
  '.test-it-out, .cds-test, #test-it-out'
];

/** Things you can type a message into. */
const COMPOSERS = [
  'textarea',
  '[contenteditable="true"]',
  'input[type="text"]',
  '[role="textbox"]'
];

const OPENER = process.env.TILEDESK_TESTER_OPENER;
const COMPOSER = process.env.TILEDESK_TESTER_COMPOSER;

/** Every place a chat could live: the page itself, and each of its frames. */
function scopes(page) {
  return [page, ...page.frames().filter((f) => f !== page.mainFrame())];
}

/**
 * The scope that holds the conversation.
 *
 * Picks the composer with the most text around it: on a CDS page the canvas has
 * inputs too (block titles, search), and the one that matters is the one inside
 * the panel where the transcript is piling up.
 */
async function findChat(page, { timeout = 30000 } = {}) {
  const deadline = Date.now() + timeout;
  let best = null;
  while (Date.now() < deadline) {
    for (const scope of scopes(page)) {
      for (const selector of (COMPOSER ? [COMPOSER] : COMPOSERS)) {
        const candidates = await scope.locator(selector).all().catch(() => []);
        for (const composer of candidates) {
          if (!(await composer.isVisible().catch(() => false))) continue;
          const panel = await panelOf(composer);
          const text = await panel.innerText().catch(() => '');
          const score = text.length;
          if (!best || score > best.score) best = { scope, composer, panel, score };
        }
      }
    }
    if (best) return best;
    await page.waitForTimeout(500);
  }
  throw new Error(
    'No chat tester found on the page. Open it by hand and run `npm run discover`\n'
    + 'to print what is there, then set TILEDESK_TESTER_OPENER / '
    + 'TILEDESK_TESTER_COMPOSER.'
  );
}

/** The transcript around a composer: its nearest ancestor that holds the panel. */
async function panelOf(composer) {
  return composer.locator(
    'xpath=ancestor::*[self::div or self::section or self::main][3]'
  ).first();
}

class Tester {
  constructor(page, chat) {
    this.page = page;
    this.composer = chat.composer;
    this.panel = chat.panel;
    this.scope = chat.scope;
  }

  /** Everything currently rendered in the panel. */
  async transcript() {
    return (await this.panel.innerText().catch(() => '')) || '';
  }

  /** Type a line and send it. */
  async send(text) {
    await this.composer.click();
    await this.composer.fill('').catch(async () => {
      // A contenteditable composer does not accept fill(); clear it by hand.
      await this.composer.press('Control+a');
      await this.composer.press('Backspace');
    });
    await this.composer.type(text, { delay: 10 });
    await this.composer.press('Enter');
  }

  /** Click one of the buttons the bot offered, by its label. */
  async clickButton(label) {
    const button = this.scope.getByText(label, { exact: true }).last();
    await button.click({ timeout: 10000 });
  }

  /**
   * Wait until the panel shows any one of these lines.
   *
   * Returns the one that matched, so a caller can report which branch a block
   * took -- a vendor block that is not configured on the project answers from
   * its false connector, and that is still the block having run.
   */
  async waitForAny(snippets, { timeout = config.REPLY_TIMEOUT } = {}) {
    const wanted = snippets.filter(Boolean);
    if (!wanted.length) return null;
    const deadline = Date.now() + timeout;
    let seen = '';
    while (Date.now() < deadline) {
      seen = await this.transcript();
      const hit = wanted.find((s) => seen.includes(s));
      if (hit) return hit;
      await this.page.waitForTimeout(400);
    }
    const tail = seen.split('\n').slice(-12).join('\n');
    throw new Error(
      `The bot never said any of:\n  ${wanted.map((s) => JSON.stringify(s)).join('\n  ')}\n`
      + `Last of what it did say:\n${tail}`
    );
  }

  /** Wait for the panel to grow, whatever it grows by. */
  async waitForAnyReply({ since, timeout = config.REPLY_TIMEOUT } = {}) {
    const before = since === undefined ? await this.transcript() : since;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const now = await this.transcript();
      if (now.length > before.length) return now.slice(before.length);
      await this.page.waitForTimeout(400);
    }
    return null;
  }
}

/**
 * Open the tester and hand back something to talk to.
 * Harmless if it is already open: the composer is found either way.
 */
async function openTester(page) {
  for (const selector of (OPENER ? [OPENER] : OPENERS)) {
    const opener = page.locator(selector).first();
    if (await opener.isVisible().catch(() => false)) {
      await opener.click().catch(() => { /* another candidate may be the real one */ });
      await page.waitForTimeout(1500);
      break;
    }
  }
  const chat = await findChat(page);
  const tester = new Tester(page, chat);
  await expect(tester.composer).toBeVisible();
  return tester;
}

/**
 * A brand new conversation.
 *
 * There is no "reset" button to rely on, and after a terminal block the bot will
 * not answer this conversation again whatever we type -- so reload the page,
 * which is the one way to get a new request id that works on every version.
 */
async function restart(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  return openTester(page);
}

module.exports = { openTester, restart, findChat, Tester };
