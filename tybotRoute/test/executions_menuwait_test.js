'use strict';

// A menu's button click arrives as a new user message (attributes.action) that runs the button's block
// directly: MenuWait names the button so the recorder can resolve the menu's exit (action.resolved).

const assert = require('assert');
const MenuWait = require('../executions/MenuWait');

const menu = (buttons) => ({
  attributes: { commands: [{ type: 'wait' }, { type: 'message', message: { text: 'Pick', attributes: { attachment: { buttons } } } }] }
});

describe('executions: MenuWait', function () {
  const buttons = MenuWait.buttonsOf(menu([
    { type: 'action', value: 'Close', action: '#close' },
    { type: 'action', value: 'Human', action: '#same' },
    { type: 'action', value: 'Again', action: '#same' },
    { type: 'text', value: 'Just text' },
    { type: 'url', value: 'Site', link: 'https://x' }
  ]));

  it('keeps only the action buttons, value and target', function () {
    assert.deepStrictEqual(buttons, [
      { value: 'Close', action: '#close' }, { value: 'Human', action: '#same' }, { value: 'Again', action: '#same' }
    ]);
    assert.deepStrictEqual(MenuWait.buttonsOf({}), []);
    assert.deepStrictEqual(MenuWait.buttonsOf(null), []);
  });
  it('caps the buttons kept', function () {
    const many = Array.from({ length: 80 }, (_, i) => ({ type: 'action', value: 'b' + i, action: '#b' + i }));
    assert.strictEqual(MenuWait.buttonsOf(menu(many)).length, MenuWait.MAX_BUTTONS);
  });
  it('a click is matched on its target, then on its text when two buttons share the target', function () {
    assert.deepStrictEqual(MenuWait.clicked(buttons, { text: 'whatever', attributes: { action: '#close' } }), { value: 'Close', action: '#close' });
    assert.strictEqual(MenuWait.clicked(buttons, { text: 'again', attributes: { action: '#same' } }).value, 'Again');
    assert.strictEqual(MenuWait.clicked(buttons, { text: 'Human', attributes: { action: '/#same' } }).value, 'Human');
  });
  it('a typed message, or a click on another menu\'s button, is not a click on this menu', function () {
    assert.strictEqual(MenuWait.clicked(buttons, { text: 'Close', attributes: {} }), null);
    assert.strictEqual(MenuWait.clicked(buttons, { text: 'Other', attributes: { action: '#elsewhere' } }), null);
    assert.strictEqual(MenuWait.clicked([], { text: 'Close', attributes: { action: '#close' } }), null);
  });
  it('the exit names the button', function () {
    assert.strictEqual(MenuWait.exitFor({ value: 'Close', action: '#close' }), 'button: Close');
  });
});
