'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const { isEnabled } = require('./config');

const als = new AsyncLocalStorage();

/**
 * Records which flow-variable keys the running action (or an incoming-message /
 * jump-params scope) writes. Only requires node built-ins and executions/config.
 */
function runAction({ executionId, stepSeq, actionIndex, actionId, requestId, onJump }, fn) {
  const store = {
    kind: 'action', requestId, executionId, stepSeq, actionIndex, actionId, onJump,
    writes: new Map()
  };
  return als.run(store, fn);
}

function runScope(name, requestId, fn) {
  const store = { kind: 'scope', name, requestId, writes: new Map() };
  return als.run(store, fn);
}

function note(requestId, key, op) {
  if (!isEnabled()) return;
  const store = als.getStore();
  if (!store || store.requestId !== requestId) return;
  store.writes.set(key, op);
}

function current() {
  return als.getStore();
}

module.exports = { runAction, runScope, note, current };
