'use strict';

/**
 * The AbortControllers of the chains running on this pod, by execution id. An execution can
 * have more than one ctx here at once (a jump that lands on the same pod while the jumping
 * chain is still unwinding), so each id holds a set; abort() aborts them all.
 */
const controllers = new Map();

const AbortRegistry = {

  /** A new controller for one chain of executionId. */
  register(executionId) {
    const ac = new AbortController();
    let set = controllers.get(executionId);
    if (!set) {
      set = new Set();
      controllers.set(executionId, set);
    }
    set.add(ac);
    return ac;
  },

  /** Aborts every chain of executionId on this pod. false: none here (the execution is on another pod, or idle). */
  abort(executionId) {
    const set = controllers.get(executionId);
    if (!set || set.size === 0) return false;
    controllers.delete(executionId);
    for (const ac of set) {
      try {
        ac.abort();
      } catch (err) {
        // a listener threw: the others still get aborted
      }
    }
    return true;
  },

  /** Forgets controller (or, without one, every controller) of executionId. Never throws. */
  release(executionId, controller) {
    const set = controllers.get(executionId);
    if (!set) return;
    if (controller) set.delete(controller);
    else set.clear();
    if (set.size === 0) controllers.delete(executionId);
  },

  _sizeForTests() {
    return controllers.size;
  }
};

module.exports = AbortRegistry;
