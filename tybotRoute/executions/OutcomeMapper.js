'use strict';

// Maps the exit an action took to an outcome (spec §7.1.7). Pure: no env, no I/O, never throws.

const FAILURE_EXITS = ['falseIntent', 'noMatchIntent', 'noInputIntent', 'errorIntent'];
const SUCCESS_EXITS = ['trueIntent', 'elseIntent', 'fallbackIntent', 'goToIntent'];

function normalize(v) {
  if (typeof v !== 'string') return '';
  let s = v.trim();
  if (s.startsWith('/')) s = s.slice(1);
  const i = s.indexOf('{');
  if (i >= 0) s = s.slice(0, i);
  return s.trim();
}

function mapOutcome({ action, jumpedTo, error } = {}) {
  if (error) return { outcome: 'error', exit_taken: null };
  const target = normalize(jumpedTo);
  if (!target) return { outcome: 'success', exit_taken: null };
  const find = (fields) => fields.find((f) => {
    const exit = normalize(action && action[f]);
    return exit && exit === target;
  });
  const fail = find(FAILURE_EXITS);
  if (fail) return { outcome: 'failure_condition', exit_taken: fail.slice(0, -'Intent'.length) };
  const ok = find(SUCCESS_EXITS);
  if (ok) return { outcome: 'success', exit_taken: ok.slice(0, -'Intent'.length) };
  return { outcome: 'success', exit_taken: 'jump' };
}

module.exports = { mapOutcome };
