const winston = require('../../utils/winston');

// Stato dell'iterazione, per nodo, su Redis (TTL 24h come il V3).
const ITER_PREFIX = 'tilebotv4:iter:';
function iterKey(requestId, nodeId) {
  return ITER_PREFIX + requestId + ':' + nodeId;
}

/** Normalizza il valore dell'iterable in array (array / JSON / CSV / object values). */
function normalizeToArray(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const p = JSON.parse(value); if (Array.isArray(p)) return p; } catch (e) { /* not json */ }
    if (value.includes(',')) return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    return value.trim().length > 0 ? [value] : null;
  }
  if (typeof value === 'object') { const v = Object.values(value); return v.length > 0 ? v : null; }
  return [value];
}

/**
 * Node `iteration` — loop su `data.iterable`. Modello a re-entry (come il V3): il
 * corpo del loop (slot `loop`) si ricollega a questo nodo; ad ogni rientro avanza
 * l'indice e assegna l'item corrente a `data.assignOutputTo`.
 *  - iterable vuoto/null/non-array → slot `fallback`;
 *  - per ogni item → slot `loop` (con l'item in `assignOutputTo`);
 *  - completato → terminale (nessuno slot valido → il walk si ferma).
 *
 * Lo stato è in Redis (`tilebotv4:iter:<rid>:<nodeId>`). Il numero di rientri è
 * limitato dal guard `MAX_STEPS` del walk (loop molto grandi vanno oltre il budget).
 */
async function execute(node, ctx) {
  const data = node.data || {};
  const output = data.assignOutputTo || 'item';
  const key = iterKey(ctx.requestId, node.id);

  let st = null;
  try {
    const raw = ctx.tdcache ? await ctx.tdcache.get(key) : null;
    st = raw ? JSON.parse(raw) : null;
  } catch (e) { st = null; }

  // Prima visita: inizializza.
  if (!st) {
    const iterableVal = await ctx.variables.get(data.iterable);
    const arr = normalizeToArray(iterableVal);
    if (!arr || arr.length === 0) {
      winston.verbose('(iteration) iterable vuoto/non-array → fallback');
      return { nextSlotKey: 'fallback' };
    }
    st = { index: 0, arr, output };
    if (ctx.tdcache) await ctx.tdcache.set(key, JSON.stringify(st), { EX: 86400 });
    await ctx.variables.set(output, arr[0]);
    winston.verbose(`(iteration) item 1/${arr.length} → loop`);
    return { nextSlotKey: 'loop', touchedVariables: true };
  }

  // Re-entry: avanza.
  st.index += 1;
  if (st.index >= st.arr.length) {
    if (ctx.tdcache) {
      if (typeof ctx.tdcache.del === 'function') await ctx.tdcache.del(key);
      else await ctx.tdcache.set(key, '', { EX: 1 });
    }
    winston.verbose('(iteration) completata → terminale');
    return { nextSlotKey: 'done' }; // slot inesistente → il walk termina il ramo
  }
  if (ctx.tdcache) await ctx.tdcache.set(key, JSON.stringify(st), { EX: 86400 });
  await ctx.variables.set(st.output, st.arr[st.index]);
  winston.verbose(`(iteration) item ${st.index + 1}/${st.arr.length} → loop`);
  return { nextSlotKey: 'loop', touchedVariables: true };
}

module.exports = { execute };
