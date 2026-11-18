'use strict';

// Maps the exit an action took to an outcome (spec §7.1.7). Pure: no env, no I/O, never throws.

const FAILURE_EXITS = ['falseIntent', 'noMatchIntent', 'noInputIntent', 'errorIntent'];
const SUCCESS_EXITS = ['trueIntent', 'elseIntent', 'fallbackIntent', 'goToIntent'];
// Pure condition actions (directive names): their false branch is a normal outcome, success / 'false'
// (spec §7.1.7). Everywhere else falseIntent means something went wrong: failure_condition.
const CONDITION_TYPES = new Set(['condition', 'jsoncondition', 'jsoncondition2', 'ifonlineagents', 'ifonlineagentsv2', 'ifopenhours']);

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
 * lead to the same block. type (the directive name, else action._tdActionType): a pure condition's
 * false branch is success / 'false', not failure_condition. With no signal the jump target is matched against the exit fields; when it
 * matches both a failure and a success exit the branch is unknown, and the record is success /
 * 'ambiguous', never failure_condition (spec §7.1.7).
 */
function mapOutcome({ action, jumpedTo, error, exit, type } = {}) {
  if (error) return { outcome: 'error', exit_taken: null };
  const t = typeof type === 'string' && type ? type : (action && action._tdActionType);
  const isCondition = typeof t === 'string' && CONDITION_TYPES.has(t.toLowerCase());
  const failed = (field) => FAILURE_EXITS.includes(field) && !(isCondition && field === 'falseIntent');
  if (typeof exit === 'string' && exit) {
    return { outcome: failed(exit) ? 'failure_condition' : 'success', exit_taken: exitName(exit) };
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
  if (fail) return { outcome: failed(fail) ? 'failure_condition' : 'success', exit_taken: exitName(fail) };
  if (ok) return { outcome: 'success', exit_taken: exitName(ok) };
  return { outcome: 'success', exit_taken: 'jump' };
}

module.exports = { mapOutcome };
