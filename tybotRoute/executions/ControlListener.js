'use strict';

const winston = require('../utils/winston');
const AbortRegistry = require('./AbortRegistry');

const CHANNEL = 'exec:control';

let subscriber = null;
// injected by index.js (start): drives a {type:"resume"} message; returns the driver's outcome
let hooks = { onResume: null };

/**
 * One exec:control message: {type:"stop", mode:"hard", execution_id} or {type:"cleanup", execution_id}
 * aborts the chains of that execution running on this pod; {type:"resume", execution_id} goes to the
 * injected onResume (every pod gets it, the lease winner drives it) and the promise of its outcome is
 * returned. Anything else is ignored (a soft stop acts through the stop flag only); malformed messages
 * with a warning.
 */
function handle(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (err) {
    winston.warn('(ControlListener) malformed ' + CHANNEL + ' message ignored (not JSON)');
    return false;
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.execution_id !== 'string' || !msg.execution_id) {
    winston.warn('(ControlListener) malformed ' + CHANNEL + ' message ignored (no execution_id)');
    return false;
  }
  if ((msg.type === 'stop' && msg.mode === 'hard') || msg.type === 'cleanup') {
    return AbortRegistry.abort(msg.execution_id);
  }
  if (msg.type === 'resume') {
    if (typeof hooks.onResume !== 'function') return false;
    return Promise.resolve()
      .then(() => hooks.onResume(msg.execution_id))
      .catch((err) => {
        winston.warn('(ControlListener) resume failed: ' + (err && err.message));
        return null;
      });
  }
  return false;
}

const ControlListener = {

  /**
   * Subscribes to exec:control on a connection of its own (a duplicate of tdcache.client: a
   * subscribed node-redis v4 client can't run other commands). Restarts if already running.
   * Never throws: false when it could not subscribe.
   */
  async start(tdcache, { onResume } = {}) {
    await ControlListener.stop();
    hooks = { onResume: typeof onResume === 'function' ? onResume : null };
    if (!tdcache || !tdcache.client) return false;
    let sub;
    try {
      sub = tdcache.client.duplicate();
      sub.on('error', (err) => winston.warn('(ControlListener) redis error: ' + (err && err.message)));
      await sub.connect();
      await sub.subscribe(CHANNEL, (message) => {
        try {
          handle(message);
        } catch (err) {
          winston.warn('(ControlListener) message handling failed: ' + (err && err.message));
        }
      });
      subscriber = sub;
      winston.info('(ControlListener) subscribed to ' + CHANNEL);
      return true;
    } catch (err) {
      winston.warn('(ControlListener) subscribe failed: ' + (err && err.message));
      if (sub) {
        try { await sub.disconnect(); } catch (e) { /* already closed */ }
      }
      return false;
    }
  },

  /** Unsubscribes and closes the connection. Never throws. */
  async stop() {
    const sub = subscriber;
    subscriber = null;
    hooks = { onResume: null };
    if (!sub) return;
    try {
      await sub.quit();
    } catch (err) {
      try { await sub.disconnect(); } catch (e) { /* already closed */ }
    }
  },

  isRunning() {
    return subscriber !== null;
  },

  CHANNEL,
  _handle: handle
};

module.exports = ControlListener;
