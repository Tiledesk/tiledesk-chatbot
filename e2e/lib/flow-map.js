'use strict';
/**
 * What to type, and what the bot should say back -- read off the artefact.
 *
 * The expectations are not hand-written. They are derived from
 * `examples/full-flow-validation-bot.json`, the same file the docker
 * integration suite seeds, so the browser walk cannot drift from the flow it is
 * walking. Re-import the bot and this map updates itself.
 *
 *   families()   the nine menus, in the order /start offers them
 *   blocks(menu) the blocks a menu offers, each with the text that proves it ran
 *   isTerminal() a block after which the bot stops answering this conversation
 */
const fs = require('fs');
const { BOT_FILE } = require('../config');

/**
 * The directives that end the conversation. After one of them this bot does not
 * answer again: the request belongs to a human, to the queue, to another bot, or
 * it is closed. The walk starts a new conversation after each one.
 */
const TERMINAL_ACTIONS = new Set(['agent', 'move_to_unassigned', 'removecurrentbot',
  'replacebot', 'replacebotv2', 'replacebotv3', 'close']);

const LINK_KEYS = new Set(['value', 'action', 'trueIntent', 'falseIntent', 'intentName',
  'goToIntent', 'conditionIntentId', 'blockName', 'no_input', 'no_match',
  'noMatchIntent', 'fallbackIntent', 'errorIntent']);

function load() {
  const bot = JSON.parse(fs.readFileSync(BOT_FILE, 'utf8'));
  const byName = new Map();
  const byId = new Map();
  for (const intent of bot.intents) {
    byName.set(intent.intent_display_name, intent);
    if (intent.intent_id) byId.set(intent.intent_id, intent);
  }
  const resolve = (token) => {
    const t = String(token).replace(/^[#/]/, '').trim();
    return byName.get(t) || byId.get(t) || null;
  };

  /** Every block this one can hand to, in the order the block lists them. */
  const linksOf = (intent) => {
    const out = [];
    const seen = new Set();
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (typeof value !== 'string') { walk(value); continue; }
        if (!LINK_KEYS.has(key)) continue;
        const target = resolve(value);
        if (target && !seen.has(target)) { seen.add(target); out.push(target); }
      }
    };
    walk(intent.actions || []);
    walk(intent.attributes || {});
    return out;
  };

  /** The buttons a block renders, as the widget labels them. */
  const buttonsOf = (intent) => {
    const out = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.buttons)) {
        for (const b of node.buttons) if (b && b.value) out.push(String(b.value));
      }
      for (const value of Object.values(node)) walk(value);
    };
    walk(intent.actions || []);
    return out;
  };

  /** Every literal the bot can say from this block. */
  const textsOf = (intent) => {
    const out = new Set();
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'text' && typeof value === 'string' && value.trim()) out.add(value.trim());
        else walk(value);
      }
    };
    walk(intent.actions || []);
    return [...out];
  };

  return { bot, byName, byId, resolve, linksOf, buttonsOf, textsOf };
}

/**
 * The part of a bot line that is safe to assert on.
 *
 * A line like `jsoncondition: TRUE, ffv_score is {{ffv_score}}` is only literal
 * up to the placeholder -- the rest is filled in at runtime -- and the widget
 * renders each line of a multi-line message separately. So: cut at the first
 * placeholder and at the first newline, drop the markdown emphasis the widget
 * turns into bold, and keep what is left if it is long enough to identify the
 * block. Anything shorter is not evidence of anything and is dropped.
 */
const PLACEHOLDER = /\$\{|\{\{/;

function snippet(text) {
  const literal = text.split('\n')[0].split(PLACEHOLDER)[0]
    .replace(/\*/g, '')
    .trim();
  return literal.length >= 8 ? literal.slice(0, 60) : null;
}

function build() {
  const { bot, byName, linksOf, buttonsOf, textsOf } = load();
  const start = byName.get('start');
  if (!start) throw new Error(`${BOT_FILE} has no "start" block`);

  const command = (intent) => '/' + intent.intent_display_name;

  const actionTypesOf = (intent) => (intent.actions || [])
    .map((a) => a._tdActionType).filter(Boolean);

  const describe = (intent) => {
    // A block proves it ran by what it says. Some blocks say nothing themselves
    // and answer through their true/false outcome instead -- and which outcome
    // depends on whether the vendor, the LLM or the department is configured on
    // the project, so accept either. The point of the walk is that the block
    // ran and the flow carried on, not which branch it took.
    const own = textsOf(intent);
    const outcomes = linksOf(intent)
      .filter((c) => c !== start)
      .flatMap((c) => textsOf(c));
    const expected = [...new Set([...own, ...outcomes])].map(snippet).filter(Boolean);
    const actions = actionTypesOf(intent);
    return {
      name: intent.intent_display_name,
      id: intent.intent_id,
      title: intent.answer || intent.question || intent.intent_display_name,
      command: command(intent),
      buttons: buttonsOf(intent),
      actions,
      expected,
      terminal: actions.some((a) => TERMINAL_ACTIONS.has(a))
    };
  };

  const families = linksOf(start)
    .filter((c) => c !== start)
    .map((menu) => Object.assign(describe(menu), {
      blocks: linksOf(menu)
        .filter((b) => b !== start && b !== menu)
        .map(describe)
    }));

  return {
    file: BOT_FILE,
    name: bot.name,
    intents: bot.intents.length,
    start: describe(start),
    families
  };
}

module.exports = { build, snippet, TERMINAL_ACTIONS };

if (require.main === module) {
  const map = build();
  console.log(`${map.name}: ${map.intents} intents, ${map.families.length} families`);
  for (const family of map.families) {
    console.log(`\n${family.command}  (${family.blocks.length} blocks)`);
    for (const block of family.blocks) {
      console.log(`  ${block.terminal ? 'END' : '   '} ${block.command.padEnd(24)} `
        + `${String(block.expected.length).padStart(2)} expectations  `
        + `${JSON.stringify(block.expected[0] || null)}`);
    }
  }
}
