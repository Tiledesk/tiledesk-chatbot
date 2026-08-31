const { evalOperation } = require('../expression-V4.js');

/**
 * Node `set_variables` — esegue in ordine le assegnazioni di `data.assignments[]`.
 * Ogni riga è la stessa coppia `destination` + `operation` di `setattribute-v2`
 * (stesso valutatore `evalOperation`): questo nodo sostituisce N nodi in catena.
 *
 * Le assegnazioni sono SEQUENZIALI — le variabili vengono rilette a ogni riga,
 * così la riga N può usare quello che ha scritto la riga N-1, esattamente come
 * accadrebbe con N nodi `setattribute-v2` collegati uno dopo l'altro.
 *
 * Una riga malformata (senza destinazione o senza operazione) viene saltata
 * senza far cadere le altre. Poi forward `direct`.
 */
async function execute(node, ctx) {
  const data = node.data || {};
  const rows = Array.isArray(data.assignments) ? data.assignments : [];
  let touched = false;

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const dest = ctx.fill(row.destination || '');
    if (!dest || !row.operation) continue;
    const vars = await ctx.variables.all();
    const value = evalOperation(row.operation, vars);
    await ctx.variables.set(dest, value);
    touched = true;
  }

  return { nextSlotKey: 'direct', touchedVariables: touched };
}

module.exports = { execute };
