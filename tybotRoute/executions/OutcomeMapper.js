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

const exitName = (field) => (field.endsWith('Intent') ? field.slice(0, -'Intent'.length) : field);

/**
 * exit: the exit field the directive noted when it picked its branch (WriteTap.noteExit: 'trueIntent',
 * 'falseIntent', ... or 'jump'). It wins over target matching, which cannot tell apart two exits that
 * lead to the same block. With no signal the jump target is matched against the exit fields; when it
 * matches both a failure and a success exit the branch is unknown, and the record is success /
 * 'ambiguous', never failure_condition (spec §7.1.7).
 */
function mapOutcome({ action, jumpedTo, error, exit } = {}) {
  if (error) return { outcome: 'error', exit_taken: null };
  if (typeof exit === 'string' && exit) {
    return { outcome: FAILURE_EXITS.includes(exit) ? 'failure_condition' : 'success', exit_taken: exitName(exit) };
  }
  const target = normalize(jumpedTo);
  if (!target) return { outcome: 'success', exit_taken: null };
  const find = (fields) => fields.find((f) => {
    const field = normalize(action && action[f]);
    return field && field === target;
  });
  const fail = find(FAILURE_EXITS);
  const ok = find(SUCCESS_EXITS);
  if (fail && ok) return { outcome: 'success', exit_taken: 'ambiguous' };
  if (fail) return { outcome: 'failure_condition', exit_taken: exitName(fail) };
  if (ok) return { outcome: 'success', exit_taken: exitName(ok) };
  return { outcome: 'success', exit_taken: 'jump' };
}

module.exports = { mapOutcome };
