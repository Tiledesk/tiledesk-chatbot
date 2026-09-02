'use strict';
/**
 * Look at the install, once, and print what the suite needs to know about it.
 *
 *   TILEDESK_TOKEN=... node discover.js
 *
 * Writes `.discovery/cds.png`, `.discovery/tester.png` and a report on stdout:
 * where the app landed, which storage keys it reads, what frames it has, and
 * what the tester's composer and transcript look like. If a locator in
 * lib/tester.js guessed wrong, this is what tells you which one to override.
 *
 * Token values are never printed -- only key names, and a fingerprint.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const config = require('./config');
const { authenticate, TOKEN_KEYS } = require('./lib/session');
const { openTester } = require('./lib/tester');

const OUT = path.join(__dirname, '.discovery');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: !config.HEADFUL });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
  await authenticate(context);
  const page = await context.newPage();

  const failures = [];
  page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() === 401 || r.status() === 403) failures.push(`${r.status()} ${r.url()}`);
  });

  console.log(`opening ${config.cdsBlocksUrl}`);
  await page.goto(config.cdsBlocksUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  console.log(`\nlanded on   ${page.url()}`);
  console.log(`title       ${await page.title()}`);

  // Which storage keys exist, and which of ours the app kept. A key the app
  // rewrote or deleted is a key it manages -- that is the one it reads.
  const storage = await page.evaluate((ours) => {
    const dump = (store) => Object.keys(store).map((k) => {
      const v = String(store.getItem(k) || '');
      return { key: k, length: v.length, looksJwt: /^ey[A-Za-z0-9_-]+\./.test(v) };
    });
    return { local: dump(localStorage), session: dump(sessionStorage), ours };
  }, TOKEN_KEYS);

  console.log('\nlocalStorage keys');
  for (const k of storage.local) {
    console.log(`  ${k.key.padEnd(28)} ${String(k.length).padStart(6)} chars`
      + `${k.looksJwt ? '  <- a JWT' : ''}${TOKEN_KEYS.includes(k.key) ? '  (we wrote this)' : ''}`);
  }

  console.log('\nframes');
  for (const frame of page.frames()) {
    console.log(`  ${frame === page.mainFrame() ? '[main] ' : '       '}${frame.url()}`);
  }

  await page.screenshot({ path: path.join(OUT, 'cds.png'), fullPage: false });
  console.log(`\nscreenshot  ${path.join(OUT, 'cds.png')}`);

  // Everything clickable whose label mentions testing: the opener is one of them.
  const clickable = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a, [role="button"], [data-testid]')) {
      const label = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '')
        .trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!label) continue;
      out.push({
        label,
        testid: el.getAttribute('data-testid') || '',
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().split(/\s+/).slice(0, 3).join('.')
      });
    }
    return out.slice(0, 120);
  });
  console.log('\nclickable (first 120)');
  for (const c of clickable) {
    console.log(`  ${c.tag.padEnd(6)} ${c.label.padEnd(42)} ${c.testid || c.cls}`);
  }

  try {
    const tester = await openTester(page);
    console.log('\ntester found');
    console.log(`  composer   ${await describe(tester.composer)}`);
    console.log(`  panel      ${await describe(tester.panel)}`);
    const text = (await tester.transcript()).split('\n').filter(Boolean).slice(0, 12);
    console.log(`  transcript ${JSON.stringify(text)}`);
    await page.screenshot({ path: path.join(OUT, 'tester.png') });
    console.log(`  screenshot ${path.join(OUT, 'tester.png')}`);
  } catch (e) {
    console.log(`\ntester NOT found: ${e.message}`);
  }

  if (failures.length) {
    console.log('\nrefused or failed while loading');
    for (const f of [...new Set(failures)].slice(0, 20)) console.log(`  ${f}`);
  }

  await browser.close();
}

async function describe(locator) {
  return locator.evaluate((el) => `${el.tagName.toLowerCase()}`
    + `${el.id ? '#' + el.id : ''}`
    + `${(el.className || '').toString().trim() ? '.' + (el.className || '').toString().trim().split(/\s+/).slice(0, 3).join('.') : ''}`
    + `${el.getAttribute('data-testid') ? `[data-testid="${el.getAttribute('data-testid')}"]` : ''}`
  ).catch(() => '(gone)');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
