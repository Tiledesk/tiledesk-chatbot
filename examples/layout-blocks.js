'use strict';
/**
 * Lay a chatbot export out for the Tiledesk design studio.
 *
 *   node examples/layout-blocks.js [bot.json]
 *
 * Rewrites the file in place. Re-run it after adding blocks; nothing but each
 * intent's `attributes.position` is touched.
 *
 * Every intent gets `attributes.position`. With none, the studio drops every
 * block on one coordinate and the canvas is unusable.
 *
 * Inside a family the layout is a tidy left-to-right tree over the flow's own
 * connectors -- the direction the studio draws them, out of a block's right edge
 * and into the next block's left edge:
 *
 *   menu  ->  the blocks of that family  ->  their outcome blocks (true/false,
 *                                            ok/ko, capture targets)
 *
 * Subtrees own disjoint vertical regions, so no two blocks can overlap. The nine
 * top-level families are then tiled three-across rather than stacked, which
 * turns a 25000 pixel ribbon into a canvas that zooms to fit.
 */
const fs = require('fs');
const path = require('path');

const BOT_FILE = process.argv[2]
  || path.join(__dirname, 'full-flow-validation-bot.json');

const DEPTH_X = [0, 0, 660, 1320, 1980]; // x within a family, by depth
const SIBLING_GAP = { 2: 90, 3: 60 };    // between siblings, by their depth
const FAMILIES_PER_COLUMN = 3;
const FAMILY_COLUMN_W = 2280;            // x pitch of one family column
const FAMILY_GAP = 360;                  // vertical gap between families
const START_X = 80;
const FAMILY_X = 620;                    // x of the family menus in column 0

/** Rough studio height of a block: a header, a row per action, a row per button. */
function heightOf(intent) {
  const actions = intent.actions || [];
  const buttons = JSON.stringify(intent).match(/"type":\s*"(?:text|action|url)"/g);
  return Math.max(140, 96 + actions.length * 44 + (buttons ? buttons.length : 0) * 30);
}

/** The keys whose string value names another block. Derived from the file. */
const LINK_KEYS = new Set(['value', 'action', 'trueIntent', 'falseIntent', 'intentName',
  'goToIntent', 'conditionIntentId', 'blockName', 'no_input', 'no_match',
  'noMatchIntent', 'fallbackIntent', 'errorIntent']);

function connectors(bot) {
  const byName = new Map();
  const byId = new Map();
  for (const i of bot.intents) {
    byName.set(i.intent_display_name, i);
    if (i.intent_id) byId.set(i.intent_id, i);
  }
  const resolve = (token) => {
    const t = String(token).replace(/^[#/]/, '').trim();
    return byName.get(t) || byId.get(t) || null;
  };
  const childrenOf = (intent) => {
    const out = [];
    const seen = new Set([intent]);
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node)) {
        if (typeof v !== 'string') { walk(v); continue; }
        if (!LINK_KEYS.has(k)) continue;
        const child = resolve(v);
        if (child && !seen.has(child)) { seen.add(child); out.push(child); }
      }
    };
    walk(intent.actions || []);
    walk(intent.attributes || {});
    return out;
  };
  return { byName, childrenOf };
}

function layout(bot) {
  const { byName, childrenOf } = connectors(bot);
  const start = byName.get('start');
  const visited = new Set([start]);
  const placed = new Map();

  // First visit wins. Every back-link -- the "main menu" button on nearly every
  // block, the iteration's loop back to its own head -- lands on a block that is
  // already placed and is skipped, so the graph is walked as a tree and each
  // block is positioned exactly once.
  function tree(intent, depth) {
    const kids = childrenOf(intent).filter((c) => {
      if (visited.has(c)) return false;
      visited.add(c);
      return true;
    });
    return { intent, depth, kids: kids.map((c) => tree(c, depth + 1)) };
  }

  function measure(node) {
    const own = heightOf(node.intent);
    if (!node.kids.length) return (node.extent = own);
    const gap = SIBLING_GAP[node.depth + 1] || 60;
    const kids = node.kids.reduce((sum, k) => sum + measure(k), 0)
      + gap * (node.kids.length - 1);
    return (node.extent = Math.max(own, kids));
  }

  function assign(node, top) {
    placed.set(node.intent, { x: DEPTH_X[Math.min(node.depth, DEPTH_X.length - 1)], y: top });
    const gap = SIBLING_GAP[node.depth + 1] || 60;
    let y = top;
    for (const kid of node.kids) {
      assign(kid, y);
      y += kid.extent + gap;
    }
  }

  const families = childrenOf(start)
    .filter((c) => { if (visited.has(c)) return false; visited.add(c); return true; })
    .map((c) => tree(c, 1));

  // Each family laid out on its own, then tiled: three per column, in the order
  // the main menu lists them, so A B C read down the first column and the ninth
  // family is bottom right.
  const columnHeights = [];
  families.forEach((family, index) => {
    measure(family);
    assign(family, 0);
    const column = Math.floor(index / FAMILIES_PER_COLUMN);
    const dx = FAMILY_X + column * FAMILY_COLUMN_W;
    const dy = columnHeights[column] || 0;
    const move = (node) => {
      const at = placed.get(node.intent);
      placed.set(node.intent, { x: at.x + dx, y: at.y + dy });
      node.kids.forEach(move);
    };
    move(family);
    columnHeights[column] = dy + family.extent + FAMILY_GAP;
  });

  // start sits to the left of the first family column, level with its middle so
  // the nine connectors fan out symmetrically rather than all diving downwards.
  const firstColumn = (columnHeights[0] || 0) - FAMILY_GAP;
  placed.set(start, { x: START_X, y: Math.round(firstColumn / 2 - heightOf(start) / 2) });

  // Whatever nothing links to -- the fallback -- goes below start, in its column.
  let orphanY = Math.round(firstColumn / 2 - heightOf(start) / 2) + heightOf(start) + 200;
  for (const intent of bot.intents) {
    if (placed.has(intent)) continue;
    placed.set(intent, { x: START_X, y: orphanY });
    orphanY += heightOf(intent) + 120;
  }
  return placed;
}

const bot = JSON.parse(fs.readFileSync(BOT_FILE, 'utf8'));
const placed = layout(bot);
for (const intent of bot.intents) {
  const rest = Object.assign({}, intent.attributes);
  delete rest.position;
  intent.attributes = Object.assign({ position: placed.get(intent) }, rest);
}
fs.writeFileSync(BOT_FILE, JSON.stringify(bot, null, 2) + '\n');

// Report, and prove no two blocks overlap.
const boxes = bot.intents.map((i) => ({
  name: i.intent_display_name, ...i.attributes.position, h: heightOf(i), w: 560
}));
let overlaps = 0;
for (let a = 0; a < boxes.length; a++) {
  for (let b = a + 1; b < boxes.length; b++) {
    const p = boxes[a], q = boxes[b];
    if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) {
      overlaps++;
      if (overlaps < 6) console.log(`  overlap: ${p.name} / ${q.name}`);
    }
  }
}
console.log(`placed ${placed.size}/${bot.intents.length} blocks, `
  + `canvas ${Math.max(...boxes.map((b) => b.x + b.w))} x ${Math.max(...boxes.map((b) => b.y + b.h))}, `
  + `${overlaps} overlaps`);
