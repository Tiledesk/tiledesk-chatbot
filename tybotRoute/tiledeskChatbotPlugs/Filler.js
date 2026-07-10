var { Liquid } = require('liquidjs');
var engine = new Liquid();
const { v4: uuidv4 } = require('uuid');

/** Attributi dinamici iniettati a ogni fill (timestamp/now/UUID). Muta e ritorna `parameters`. */
function withDynamics(parameters) {
  if (!parameters) {
    parameters = {};
  }
  parameters['timestamp'] = Date.now(); // type number
  parameters['now'] = new Date().toISOString(); // type Object
  parameters['UUID'] = uuidv4().replace(/-/g, '');
  parameters['UUIDv4'] = uuidv4();
  return parameters;
}

const WS = { ' ': 1, '\t': 1, '\n': 1, '\r': 1 };
function isWs(c) {
  return WS[c] === 1;
}

/**
 * Rimuove un filtro `| json` FINALE dall'espressione: in un body JSON codifichiamo
 * noi il valore in JSON (via `JSON.stringify` del valore tipizzato), quindi il
 * filtro `json` sarebbe ridondante e — se lasciato — produrrebbe una doppia
 * codifica (`payload | json` → stringa `'{"a":1}'` → `'"{\"a\":1}"'`).
 */
function stripJsonFilter(expr) {
  return String(expr).replace(/\|\s*json\s*$/i, '').trim();
}

/**
 * Token JSON valido da un valore tipizzato. `undefined`/funzioni/riferimenti
 * circolari → `'null'`. Mai un'eccezione (così una singola interpolazione non può
 * rompere il parse dell'intero body).
 */
function toJsonToken(value) {
  if (value === undefined) return 'null';
  try {
    const s = JSON.stringify(value);
    return s === undefined ? 'null' : s;
  } catch (e) {
    return 'null';
  }
}

/** Escape del CONTENUTO di una stringa JSON (senza le virgolette esterne). */
function escapeJsonInner(str) {
  const encoded = JSON.stringify(String(str == null ? '' : str));
  return encoded.slice(1, -1);
}

/**
 * A partire dalla virgoletta in `quoteIdx`, riconosce il pattern `"{{ expr }}"` in
 * cui il placeholder è l'UNICO contenuto tra le virgolette (whitespace a parte).
 * Ritorna `{ expr, end }` (end = indice dopo la virgoletta di chiusura) oppure null.
 */
function matchSoleQuotedPlaceholder(text, quoteIdx) {
  let k = quoteIdx + 1;
  while (k < text.length && isWs(text[k])) k++;
  if (text[k] !== '{' || text[k + 1] !== '{') return null;
  const end = text.indexOf('}}', k + 2);
  if (end === -1) return null;
  const expr = text.slice(k + 2, end).trim();
  let m = end + 2;
  while (m < text.length && isWs(text[m])) m++;
  if (text[m] !== '"') return null;
  return { expr, end: m + 1 };
}

class Filler {

  fill(text, parameters) {
    // create dynamic attributes
    parameters = withDynamics(parameters);

    // legacy parser first
    if (text == null || text == undefined || typeof text !== 'string') {
      return text;
    }
    if (parameters) {
      for (const [key, value] of Object.entries(parameters)) {
        text = text.replace(new RegExp("(\\$\\{" + key + "\\})", 'i'), value); //parameters[key]);
      }
    }

    // then post process with new LiquidJS!
    let result = text;
    try {
      result = engine
      .parseAndRenderSync(text, parameters, null);
    }
    catch(e) {
      // console.error(e)
    }
    return result;
  }

  /**
   * Fill SAFE per un body JSON: ogni `{{ ... }}` è sostituito con una codifica JSON
   * VALIDA del suo valore, così che NESSUNA singola interpolazione possa rompere il
   * `JSON.parse` dell'intero body. Al massimo un placeholder non restituisce il
   * valore (→ `null` in posizione di valore, `""` dentro una stringa), mai un errore.
   *
   * Comportamento UNIFICATO (queste forme non rompono più il body):
   *   - `{{ x }}`, `{{ x | json }}`, `"{{ x }}"`, `"{{ x | json }}"`
   *     → in posizione di valore JSON producono TUTTE lo stesso token: il valore
   *       tipizzato serializzato (`JSON.stringify`). Numero→`200`, oggetto→`{...}`,
   *       stringa→`"..."`. Il filtro `| json` è ridondante; le virgolette che
   *       avvolgono il SOLO placeholder vengono assorbite (quoted ≡ bare).
   *   - `"... {{ x }} ..."` (placeholder dentro una stringa più lunga)
   *     → il valore è reso come stringa e JSON-escaped: virgolette/newline non
   *       spezzano la stringa (`[object Object]` per un oggetto senza `| json`).
   *   - valore mancante/errore → `null` (valore) o `""` (stringa).
   *
   * NB: NON esegue il replacement legacy `${key}` (i body JSON usano `{{ }}`).
   */
  fillJson(text, parameters) {
    if (text == null || typeof text !== 'string') {
      return text;
    }
    const params = withDynamics(parameters);

    const valueToken = (expr) => {
      let value;
      try { value = engine.evalValueSync(stripJsonFilter(expr), params); }
      catch (e) { value = undefined; }
      return toJsonToken(value);
    };
    const stringToken = (expr) => {
      let rendered = '';
      try { rendered = engine.parseAndRenderSync('{{' + expr + '}}', params, null); }
      catch (e) { rendered = ''; }
      return escapeJsonInner(rendered);
    };

    let out = '';
    let i = 0;
    const n = text.length;
    let inStr = false; // true se ci troviamo dentro una stringa JSON "..."

    while (i < n) {
      const ch = text[i];

      // Apertura stringa in posizione di valore: assorbi `"{{ solo-placeholder }}"`
      // (quoted ≡ bare), altrimenti entra in modalità stringa.
      if (ch === '"' && !inStr) {
        const sole = matchSoleQuotedPlaceholder(text, i);
        if (sole) {
          if (sole.expr) out += valueToken(sole.expr);
          else out += '""';
          i = sole.end;
          continue;
        }
        inStr = true;
        out += ch;
        i++;
        continue;
      }

      // Chiusura stringa su `"` non escaped.
      if (ch === '"' && inStr) {
        let b = 0;
        let j = i - 1;
        while (j >= 0 && text[j] === '\\') { b++; j--; }
        if (b % 2 === 0) inStr = false;
        out += ch;
        i++;
        continue;
      }

      // Placeholder `{{ ... }}`.
      if (ch === '{' && text[i + 1] === '{') {
        const end = text.indexOf('}}', i + 2);
        if (end === -1) { out += text.slice(i); break; }
        const expr = text.slice(i + 2, end).trim();
        if (expr) out += inStr ? stringToken(expr) : valueToken(expr);
        i = end + 2;
        continue;
      }

      out += ch;
      i++;
    }

    return out;
  }

}

module.exports = { Filler };
