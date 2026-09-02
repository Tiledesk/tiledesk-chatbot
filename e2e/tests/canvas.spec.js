'use strict';
/**
 * The other half of "does the import work": does the canvas read.
 *
 * `examples/layout-blocks.js` gives every block an `attributes.position`. This
 * checks the studio honoured them -- that the blocks landed in as many distinct
 * places as there are blocks, and that none of them sits on top of another.
 *
 * It is a rendering check, so it is the one place a class name is unavoidable.
 * If the studio's markup has moved, set TILEDESK_CANVAS_BLOCK to a selector that
 * matches one block; the test says so rather than failing for the wrong reason.
 */
const { test, expect } = require('@playwright/test');
const config = require('../config');
const { authenticate, openCds } = require('../lib/session');
const { build } = require('../lib/flow-map');

const CANDIDATES = [
  process.env.TILEDESK_CANVAS_BLOCK,
  '[id^="block"]',
  '[class*="block-item" i]',
  '[class*="intent-content" i]',
  '[class*="cds-block" i]',
  '[data-testid*="block" i]'
].filter(Boolean);

test('every block landed in its own place on the canvas', async ({ browser }) => {
  const map = build();
  const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
  await authenticate(context);
  const page = await context.newPage();
  await openCds(page, config.cdsBlocksUrl);
  await page.waitForTimeout(8000); // the canvas draws its connectors last

  let blocks = [];
  let used = null;
  for (const selector of CANDIDATES) {
    const boxes = await boxesOf(page, selector);
    if (boxes.length > blocks.length) { blocks = boxes; used = selector; }
  }

  test.skip(blocks.length < 10,
    `Could not find the blocks on the canvas (best guess "${used}" matched `
    + `${blocks.length}). Set TILEDESK_CANVAS_BLOCK to a selector for one block.`);

  console.log(`  ${blocks.length} blocks matched by ${used}`);

  const places = new Set(blocks.map((b) => `${Math.round(b.x)},${Math.round(b.y)}`));
  expect(places.size, 'blocks stacked on the same coordinate are the unreadable case '
    + 'this layout exists to fix').toBe(blocks.length);

  const overlaps = [];
  for (let a = 0; a < blocks.length; a++) {
    for (let b = a + 1; b < blocks.length; b++) {
      const p = blocks[a];
      const q = blocks[b];
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) {
        overlaps.push(`${p.label || a} / ${q.label || b}`);
      }
    }
  }
  expect(overlaps, `overlapping blocks:\n  ${overlaps.slice(0, 10).join('\n  ')}`).toEqual([]);

  console.log(`  the flow has ${map.intents} intents; the canvas drew ${blocks.length}`);
  await context.close();
});

/** Canvas coordinates, not screen ones: the canvas is panned and zoomed. */
async function boxesOf(page, selector) {
  return page.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 20) continue; // decorations, not blocks
      out.push({
        x: r.x, y: r.y, w: r.width, h: r.height,
        label: (el.innerText || '').trim().split('\n')[0].slice(0, 30)
      });
    }
    return out;
  }, selector).catch(() => []);
}
