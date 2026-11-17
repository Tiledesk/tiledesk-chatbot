'use strict';

// A menu (replyv2 with action buttons) that ended its chain waiting for the user: a click arrives later as a
// new user message carrying attributes.action, which runs the button's block directly (the menu is not run
// again), so the menu's own record never learns the button. The recorder keeps the menu's buttons at the
// chain's end and, on the click, names the button on the menu's action (action.resolved). Pure: no I/O.

const MAX_BUTTONS = 50;
const MAX_VALUE = 200;

const norm = (v) => (typeof v === 'string' ? v.trim() : '');
const target = (v) => norm(v).replace(/^\//, '');

/** The action buttons of a replyv2 action, as [{ value, action }] (capped); [] when it has none. */
function buttonsOf(action) {
  const out = [];
  const commands = action && action.attributes && Array.isArray(action.attributes.commands) ? action.attributes.commands : [];
  for (const command of commands) {
    const buttons = command && command.type === 'message' && command.message && command.message.attributes &&
      command.message.attributes.attachment && command.message.attributes.attachment.buttons;
    if (!Array.isArray(buttons)) continue;
    for (const b of buttons) {
      if (!b || b.type !== 'action' || out.length >= MAX_BUTTONS) continue;
      out.push({ value: norm(b.value).slice(0, MAX_VALUE), action: target(b.action) });
    }
  }
  return out;
}

/**
 * The button a user message clicked, or null. Only a message with attributes.action is a click: matched on
 * the button's target first, then on its text (two buttons may lead to the same block).
 */
function clicked(buttons, message) {
  const attrs = message && message.attributes;
  const action = attrs && target(attrs.action);
  if (!action || !Array.isArray(buttons) || buttons.length === 0) return null;
  const text = norm(message.text).toLowerCase();
  const sameTarget = buttons.filter((b) => b.action && b.action === action);
  if (sameTarget.length === 1) return sameTarget[0];
  const pool = sameTarget.length > 1 ? sameTarget : buttons;
  return pool.find((b) => b.value && b.value.toLowerCase() === text) || (sameTarget.length > 1 ? sameTarget[0] : null);
}

/** The exit name recorded for a button. */
function exitFor(button) {
  return 'button: ' + (button.value || button.action || '?');
}

module.exports = { buttonsOf, clicked, exitFor, MAX_BUTTONS };
