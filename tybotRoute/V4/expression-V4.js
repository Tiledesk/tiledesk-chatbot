const { TiledeskExpression } = require('../TiledeskExpression.js');
const { TiledeskMath } = require('../TiledeskMath.js');
const { TiledeskString } = require('../TiledeskString.js');
const { Filler } = require('../tiledeskChatbotPlugs/Filler.js');
const winston = require('../utils/winston');

const filler = new Filler();

/**
 * Valutazione delle espressioni V4 — UNICO punto di contatto con `TiledeskExpression`.
 *
 * `condition`/`jsoncondition`: la struttura `data.groups` coincide esattamente con
 * l'input di `JSONGroupsToExpression` (stessa via usata da `when-eval-V4`).
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

module.exports = { evalGroups, evalOperation };
