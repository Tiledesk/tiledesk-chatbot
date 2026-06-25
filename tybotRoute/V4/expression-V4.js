const { TiledeskExpression } = require('../TiledeskExpression.js');
const { TiledeskWhenExpression } = require('../TiledeskWhenExpression.js');
const { TiledeskMath } = require('../TiledeskMath.js');
const { TiledeskString } = require('../TiledeskString.js');
const { Filler } = require('../tiledeskChatbotPlugs/Filler.js');
const winston = require('../utils/winston');

const filler = new Filler();

/**
 * Valutazione delle espressioni V4 — UNICO punto di contatto con `TiledeskExpression`
 * (path legacy) e `TiledeskWhenExpression` (path safe `when`).
 *
 * `condition`/`jsoncondition`: la valutazione passa per `evalConditionData`, che
 * PREFERISCE il campo `data.when` (stringa in grammatica safe, valutata da
 * `TiledeskWhenExpression`, no-eval) e fa FALLBACK su `data.groups` (legacy
 * `evalGroups`/`JSONGroupsToExpression`) quando `when` è assente. Stesso schema di
 * retrocompatibilità di `DirJSONConditionV2` lato V3: i bot vecchi (senza `when`)
 * continuano a valutare i `groups` esattamente come prima.
 * `setattribute-v2`: mirror di `DirSetAttributeV2` (fill {{}} → JSONOperationToExpression
 * → eval con TiledeskMath/TiledeskString nel sandbox).
 */

/** Valuta i gruppi di una condizione → boolean. Fail-safe: errore/invalid → false. */
function evalGroups(groups, variables) {
  try {
    const expr = TiledeskExpression.JSONGroupsToExpression(groups || [], variables || {});
    if (expr == null || expr === '') return false;
    const result = new TiledeskExpression().evaluateStaticExpression(expr, variables || {});
    return !!result;
  } catch (err) {
    winston.error('(expression-V4) evalGroups error: ', err);
    return false;
  }
}

/**
 * Valuta la stringa-espressione `when` (grammatica safe) con `TiledeskWhenExpression`.
 * Nessun `eval`/`Function`/`vm`. Fail-safe: errore/valore nullo → false (la
 * condizione che non si può valutare prende il ramo falso), in parità con il
 * comportamento del ramo `result === null` di `DirJSONConditionV2`.
 */
function evalWhen(when, variables) {
  try {
    const value = new TiledeskWhenExpression().evaluate(when, variables || {});
    if (value === null || value === undefined) return false;
    return Boolean(value);
  } catch (err) {
    winston.error('(expression-V4) evalWhen error: ', err);
    return false;
  }
}

/**
 * Valuta la condizione di un node `condition`/`jsoncondition` → boolean.
 * Preferisce `data.when` (safe); in sua assenza usa il legacy `data.groups`.
 */
function evalConditionData(data, variables) {
  const when = data?.when;
  if (typeof when === 'string' && when.trim() !== '') {
    return evalWhen(when, variables);
  }
  return evalGroups(data?.groups || [], variables);
}

/**
 * Valuta un'operazione `setattribute-v2` (`{operands:[{value,isVariable,function?,type?}], operators:[]}`)
 * → valore calcolato. Fill {{}} negli operandi prima della build.
 */
function evalOperation(operation, variables) {
  try {
    const operands = (operation && operation.operands) || [];
    const operators = operation && operation.operators;
    if (operands.length === 0) return null;
    // fill {{var}} in ogni operando (copia: non muto il nodo)
    const filled = operands.map((op) => ({
      ...op,
      value: filler.fill(op.value != null ? String(op.value) : '', variables || {}),
    }));
    // operando JSON singolo: assegnazione diretta del parsed
    if (filled.length === 1 && filled[0].type === 'json') {
      try { return JSON.parse(filled[0].value); } catch (e) { return filled[0].value; }
    }
    const expr = TiledeskExpression.JSONOperationToExpression(operators, filled);
    if (expr == null) return null;
    const sandbox = { ...(variables || {}), TiledeskMath, TiledeskString };
    return new TiledeskExpression().evaluateJavascriptExpression(expr, sandbox);
  } catch (err) {
    winston.error('(expression-V4) evalOperation error: ', err);
    return null;
  }
}

module.exports = { evalGroups, evalWhen, evalConditionData, evalOperation };
