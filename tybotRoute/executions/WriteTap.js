'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const { isEnabled } = require('./config');

const als = new AsyncLocalStorage();

/**
 * Records which flow-variable keys the running action (or an incoming-message /
 * jump-params scope) writes. Only requires node built-ins and executions/config.
 */
function runAction({ executionId, stepSeq, actionIndex, actionId, requestId, onJump, isAborted }, fn) {
  const store = {
    kind: 'action', requestId, executionId, stepSeq, actionIndex, actionId, onJump, isAborted,
    writes: new Map(),
    exit: undefined // the exit the directive took (noteExit), read by the recorder's OutcomeMapper call
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

/**
 * A conditional directive says which exit it took ('trueIntent', 'falseIntent', ... or 'jump' for a
 * target that is no exit field), at the point where it picks its branch. The OutcomeMapper prefers it
 * to matching the jump target, which cannot tell two exits apart when they lead to the same block.
 * Flag off, or outside a traced action: a no-op (no store, nothing written). Last call wins.
 */
function noteExit(exit) {
  if (!isEnabled()) return;
  const store = als.getStore();
  if (!store || store.kind !== 'action' || typeof exit !== 'string' || !exit) return;
  store.exit = exit;
}

/**
 * An untraced continuation (a jump of an execution that ended, which resolve left unrecorded): the rest of
 * this /ext handler, and everything it starts, runs under a marker store carrying that execution id, so
 * the chain's later jumps carry it too (beforeJump) and resolve to nothing as well, hop after hop.
 * Synchronous, in the caller's own async context (AsyncLocalStorage.enterWith). Flag off: a no-op.
 */
function enterUntraced(requestId, executionId) {
  if (!isEnabled() || typeof executionId !== 'string' || !executionId) return;
  als.enterWith({ kind: 'untraced', requestId, executionId, writes: new Map() });
}

function current() {
  return als.getStore();
}

module.exports = { runAction, runScope, note, noteExit, enterUntraced, current };
