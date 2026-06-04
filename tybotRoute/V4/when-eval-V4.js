const { TiledeskExpression } = require('../TiledeskExpression.js');
const winston = require('../utils/winston');

/**
 * Valutatore del filtro `Message.when` (stringa DSL del Design Studio V4).
 *
 * Grammatica (mirror di design-studio-V4 src/app/ui/filter-condition/when-parser.ts):
 *   expression := clause ( ('AND'|'OR') clause )*
 *   clause     := IDENT operator [ value ]      // value omesso per operatori valueless
 *   value      := STRING (single-quoted)  |  IDENT (ref variabile)
 *
 * La semantica degli operatori è quella canonica del runtime (`TiledeskExpression`),
 * così V4 e V3 valutano le condizioni allo stesso identico modo.
 *
 * Convenzione: `when` vuoto/assente → messaggio SEMPRE mostrato (true). In caso di
 * errore di parsing/valutazione → true (non nascondere contenuto per un bug).
 */

// token canonico → nome operatore legacy (chiavi di TiledeskExpression.OPERATORS)
const SYMBOL_TO_OP = {
  '==n': 'equalAsNumbers',
  '!=n': 'notEqualAsNumbers',
  '==': 'equalAsStrings',
  '!=': 'notEqualAsStrings',
  '>=': 'greaterThanOrEqual',
  '<=': 'lessThanOrEqual',
  '>': 'greaterThan',
  '<': 'lessThan',
};
const SYMBOLS = ['==n', '!=n', '==', '!=', '>=', '<=', '>', '<']; // longest-match first
const KEYWORD_OPS = new Set([
  'startsWith', 'notStartsWith', 'startsWithIgnoreCase', 'endsWith',
  'contains', 'containsIgnoreCase', 'matches', 'isEmpty', 'isNull', 'isUndefined',
]);
const VALUELESS = new Set(['isEmpty', 'isNull', 'isUndefined']);

const isIdentStart = (c) => /[A-Za-z_]/.test(c);
const isIdentPart = (c) => /[A-Za-z0-9_]/.test(c);

/** Tokenizza la stringa DSL. */
function lex(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'") {
      i++;
      let out = '';
      let closed = false;
      while (i < src.length) {
        const ch = src[i];
        if (ch === '\\') {
          const esc = src[i + 1];
          if (esc === "'" || esc === '\\') { out += esc; i += 2; continue; }
          throw new Error('escape non valido');
        }
        if (ch === "'") { i++; closed = true; break; }
        out += ch; i++;
      }
      if (!closed) throw new Error('stringa non terminata');
      tokens.push({ kind: 'STRING', text: out });
      continue;
    }
    let sym = null;
    for (const s of SYMBOLS) { if (src.startsWith(s, i)) { sym = s; break; } }
    if (sym) { tokens.push({ kind: 'OP', text: sym }); i += sym.length; continue; }
    if (isIdentStart(c)) {
      const start = i;
      while (i < src.length && isIdentPart(src[i])) i++;
      const text = src.slice(start, i);
      if (text === 'AND' || text === 'OR') tokens.push({ kind: 'LOGICAL', text });
      else if (KEYWORD_OPS.has(text)) tokens.push({ kind: 'OP', text });
      else tokens.push({ kind: 'IDENT', text });
      continue;
    }
    throw new Error("carattere inatteso '" + c + "'");
  }
  return tokens;
}

/** Parsa i token in un array di condizioni in stile `_tdJSONCondition`. */
function parseConditions(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];

  function parseClause() {
    const v = next();
    if (!v || v.kind !== 'IDENT') throw new Error('attesa una variabile');
    const opT = next();
    if (!opT || opT.kind !== 'OP') throw new Error('atteso un operatore');
    const opName = SYMBOL_TO_OP[opT.text] || opT.text; // keyword ops = stesso nome
    const cond = { type: 'condition', operand1: v.text, operator: opName };
    if (VALUELESS.has(opName)) {
      cond.operand2 = { type: 'const', value: '' }; // dummy: il pattern valueless usa solo #1
    } else {
      const val = next();
      if (val && val.kind === 'STRING') cond.operand2 = { type: 'const', value: val.text };
      else if (val && val.kind === 'IDENT') cond.operand2 = { type: 'var', name: val.text };
      else throw new Error('atteso un valore (stringa tra apici o nome variabile)');
    }
    return cond;
  }

  const conditions = [parseClause()];
  while (peek() && peek().kind === 'LOGICAL') {
    conditions.push({ type: 'operator', operator: next().text });
    conditions.push(parseClause());
  }
  if (peek()) throw new Error("token inatteso '" + peek().text + "'");
  return conditions;
}

/**
 * Valuta `when` contro `variables`. Ritorna true se il messaggio va mostrato.
 * @param {string|null|undefined} when
 * @param {Object} variables
 * @returns {boolean}
 */
function evaluateWhen(when, variables) {
  if (when == null) return true;
  const text = String(when).trim();
  if (text === '') return true;
  try {
    const conditions = parseConditions(lex(text));
    const group = { type: 'expression', conditions };
    const expr = TiledeskExpression.JSONGroupsToExpression([group], variables || {});
    if (expr == null) {
      winston.warn('(when-eval-V4) espressione null per when="' + text + '" → mostro il messaggio');
      return true;
    }
    const result = new TiledeskExpression().evaluateStaticExpression(expr, variables || {});
    if (result === null || result === undefined) {
      winston.warn('(when-eval-V4) valutazione nulla per when="' + text + '" → mostro il messaggio');
      return true;
    }
    return !!result;
  } catch (err) {
    winston.error('(when-eval-V4) errore valutando when="' + text + '": ' + err.message + ' → mostro il messaggio');
    return true;
  }
}

module.exports = { evaluateWhen };
