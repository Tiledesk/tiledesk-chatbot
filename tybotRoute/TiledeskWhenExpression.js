/**
 * TiledeskWhenExpression
 *
 * Safe evaluator for the new `when` field of JSON conditions.
 *
 * Design goals (see security review of TiledeskExpression.evaluateJavascriptExpression):
 *  - NO `eval`, NO `Function`, NO `vm`/`vm2`. The expression is parsed into an AST
 *    and interpreted by walking the tree. Code is never generated from data.
 *  - Whitelisted operators and whitelisted functions only.
 *  - Property access is blocked on dangerous keys (__proto__, prototype, constructor).
 *  - Function calls are allowed ONLY for plain identifiers present in the function
 *    whitelist (no method calls on arbitrary objects -> blocks `x.constructor(...)`).
 *  - Identifiers resolve exclusively against the provided variables map (own props only),
 *    so there is no access to host globals.
 *  - Hard limits on input length and recursion depth.
 *
 * This file lives ALONGSIDE the legacy TiledeskExpression.js, which is left untouched.
 *
 * Public API:
 *   const { TiledeskWhenExpression } = require('./TiledeskWhenExpression');
 *   const value = new TiledeskWhenExpression().evaluate(whenString, variables);
 *   // throws WhenSyntaxError / WhenEvalError on failure (callers decide how to route)
 */

class WhenSyntaxError extends Error {
  constructor(message) { super(message); this.name = 'WhenSyntaxError'; }
}
class WhenEvalError extends Error {
  constructor(message) { super(message); this.name = 'WhenEvalError'; }
}

const TOKEN = { NUM: 'num', STR: 'str', IDENT: 'ident', OP: 'op', PUNC: 'punc', EOF: 'eof' };

// Binary operator precedence (higher binds tighter). Unary operators handled separately.
const BIN_PRECEDENCE = {
  '||': 1,
  '&&': 2,
  '==': 3, '!=': 3, '===': 3, '!==': 3,
  '<': 4, '<=': 4, '>': 4, '>=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
};

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const MAX_EXPRESSION_LENGTH = 10000;
const MAX_DEPTH = 100;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function isIdentStart(c) { return /[A-Za-z_$]/.test(c); }
function isIdentPart(c) { return /[A-Za-z0-9_$]/.test(c); }
function isDigit(c) { return c >= '0' && c <= '9'; }

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    // whitespace
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }

    // string literal
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      let s = '';
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          i++;
          const e = src[i];
          if (e === 'n') s += '\n';
          else if (e === 't') s += '\t';
          else if (e === 'r') s += '\r';
          else if (e === '\\') s += '\\';
          else if (e === '"') s += '"';
          else if (e === "'") s += "'";
          else s += (e === undefined ? '' : e);
          i++;
        } else {
          s += src[i];
          i++;
        }
      }
      if (i >= n) throw new WhenSyntaxError('Unterminated string literal');
      i++; // consume closing quote
      tokens.push({ type: TOKEN.STR, value: s });
      continue;
    }

    // number literal
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      const start = i;
      while (i < n && isDigit(src[i])) i++;
      if (src[i] === '.') { i++; while (i < n && isDigit(src[i])) i++; }
      if (src[i] === 'e' || src[i] === 'E') {
        i++;
        if (src[i] === '+' || src[i] === '-') i++;
        while (i < n && isDigit(src[i])) i++;
      }
      tokens.push({ type: TOKEN.NUM, value: Number(src.slice(start, i)) });
      continue;
    }

    // identifier / keyword
    if (isIdentStart(c)) {
      const start = i;
      i++;
      while (i < n && isIdentPart(src[i])) i++;
      tokens.push({ type: TOKEN.IDENT, value: src.slice(start, i) });
      continue;
    }

    // multi-char operators (longest match first)
    const three = src.slice(i, i + 3);
    if (three === '===' || three === '!==') { tokens.push({ type: TOKEN.OP, value: three }); i += 3; continue; }

    const two = src.slice(i, i + 2);
    if (two === '?.') { tokens.push({ type: TOKEN.PUNC, value: '?.' }); i += 2; continue; }
    if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||') {
      tokens.push({ type: TOKEN.OP, value: two }); i += 2; continue;
    }

    // single-char operators
    if ('+-*/%<>!'.includes(c)) { tokens.push({ type: TOKEN.OP, value: c }); i++; continue; }

    // punctuators
    if ('()[],.'.includes(c)) { tokens.push({ type: TOKEN.PUNC, value: c }); i++; continue; }

    throw new WhenSyntaxError("Unexpected character '" + c + "' at position " + i);
  }

  tokens.push({ type: TOKEN.EOF, value: null });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser (recursive descent + precedence climbing)
// ---------------------------------------------------------------------------

class Parser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; }

  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }

  expectPunc(value) {
    const t = this.next();
    if (!(t.type === TOKEN.PUNC && t.value === value)) {
      throw new WhenSyntaxError("Expected '" + value + "' but found '" + t.value + "'");
    }
  }

  parse() {
    const node = this.parseExpression();
    if (this.peek().type !== TOKEN.EOF) {
      throw new WhenSyntaxError("Unexpected token '" + this.peek().value + "'");
    }
    return node;
  }

  parseExpression() { return this.parseBinary(0); }

  parseBinary(minPrec) {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (t.type !== TOKEN.OP) break;
      const prec = BIN_PRECEDENCE[t.value];
      if (prec === undefined || prec < minPrec) break;
      this.next();
      const right = this.parseBinary(prec + 1); // left-associative
      if (t.value === '&&' || t.value === '||') {
        left = { type: 'Logical', op: t.value, left, right };
      } else {
        left = { type: 'Binary', op: t.value, left, right };
      }
    }
    return left;
  }

  parseUnary() {
    const t = this.peek();
    if (t.type === TOKEN.OP && (t.value === '!' || t.value === '-' || t.value === '+')) {
      this.next();
      return { type: 'Unary', op: t.value, arg: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let node = this.parsePrimary();
    while (true) {
      const t = this.peek();
      if (t.type === TOKEN.PUNC && t.value === '.') {
        this.next();
        const id = this.next();
        if (id.type !== TOKEN.IDENT) throw new WhenSyntaxError("Expected property name after '.'");
        node = { type: 'Member', object: node, property: id.value, computed: false, optional: false };
      } else if (t.type === TOKEN.PUNC && t.value === '?.') {
        this.next();
        if (this.peek().type === TOKEN.PUNC && this.peek().value === '[') {
          this.next();
          const expr = this.parseExpression();
          this.expectPunc(']');
          node = { type: 'Member', object: node, property: expr, computed: true, optional: true };
        } else {
          const id = this.next();
          if (id.type !== TOKEN.IDENT) throw new WhenSyntaxError("Expected property name after '?.'");
          node = { type: 'Member', object: node, property: id.value, computed: false, optional: true };
        }
      } else if (t.type === TOKEN.PUNC && t.value === '[') {
        this.next();
        const expr = this.parseExpression();
        this.expectPunc(']');
        node = { type: 'Member', object: node, property: expr, computed: true, optional: false };
      } else if (t.type === TOKEN.PUNC && t.value === '(') {
        this.next();
        const args = [];
        if (!(this.peek().type === TOKEN.PUNC && this.peek().value === ')')) {
          args.push(this.parseExpression());
          while (this.peek().type === TOKEN.PUNC && this.peek().value === ',') {
            this.next();
            args.push(this.parseExpression());
          }
        }
        this.expectPunc(')');
        node = { type: 'Call', callee: node, args };
      } else {
        break;
      }
    }
    return node;
  }

  parsePrimary() {
    const t = this.next();
    if (t.type === TOKEN.NUM) return { type: 'Literal', value: t.value };
    if (t.type === TOKEN.STR) return { type: 'Literal', value: t.value };
    if (t.type === TOKEN.IDENT) {
      if (t.value === 'true') return { type: 'Literal', value: true };
      if (t.value === 'false') return { type: 'Literal', value: false };
      if (t.value === 'null') return { type: 'Literal', value: null };
      if (t.value === 'undefined') return { type: 'Literal', value: undefined };
      return { type: 'Identifier', name: t.value };
    }
    if (t.type === TOKEN.PUNC && t.value === '(') {
      const node = this.parseExpression();
      this.expectPunc(')');
      return node;
    }
    throw new WhenSyntaxError("Unexpected token '" + (t.value === null ? 'EOF' : t.value) + "'");
  }
}

// ---------------------------------------------------------------------------
// Evaluator helpers (type coercion mirrors the intent of the legacy operators)
// ---------------------------------------------------------------------------

function isNumeric(v) {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string' && v.trim() !== '') return Number.isFinite(Number(v));
  return false;
}

function looseEq(l, r) {
  if (isNumeric(l) && isNumeric(r)) return Number(l) === Number(r);
  return String(l) === String(r);
}

function compare(l, r) {
  if (isNumeric(l) && isNumeric(r)) {
    const a = Number(l), b = Number(r);
    return a < b ? -1 : (a > b ? 1 : 0);
  }
  const a = String(l), b = String(r);
  return a < b ? -1 : (a > b ? 1 : 0);
}

function applyBinary(op, l, r) {
  switch (op) {
    case '+':
      if (isNumeric(l) && isNumeric(r)) return Number(l) + Number(r);
      return String(l) + String(r);
    case '-': return Number(l) - Number(r);
    case '*': return Number(l) * Number(r);
    case '/': return Number(l) / Number(r);
    case '%': return Number(l) % Number(r);
    case '==': return looseEq(l, r);
    case '!=': return !looseEq(l, r);
    case '===': return l === r;
    case '!==': return l !== r;
    case '<': return compare(l, r) < 0;
    case '<=': return compare(l, r) <= 0;
    case '>': return compare(l, r) > 0;
    case '>=': return compare(l, r) >= 0;
    default: throw new WhenEvalError('Unknown binary operator: ' + op);
  }
}

// Whitelisted functions callable from a `when` expression. Names mirror the
// legacy TiledeskExpression.OPERATORS semantics. This table is the ONLY way an
// expression can invoke code.
const DEFAULT_FUNCTIONS = {
  startsWith: (a, b) => String(a).startsWith(String(b)),
  notStartsWith: (a, b) => !String(a).startsWith(String(b)),
  startsWithIgnoreCase: (a, b) => String(a).toLowerCase().startsWith(String(b).toLowerCase()),
  endsWith: (a, b) => String(a).toLowerCase().endsWith(String(b).toLowerCase()),
  contains: (a, b) => String(a).includes(String(b)),
  containsIgnoreCase: (a, b) => String(a).toLowerCase().includes(String(b).toLowerCase()),
  isEmpty: (a) => a === '' || a === null || a === undefined,
  isNull: (a) => a === null,
  isUndefined: (a) => a === undefined,
  matches: (a, b) => { try { return String(a).match(new RegExp(String(b))) ? true : false; } catch (e) { return false; } },
  upperCase: (a) => String(a).toUpperCase(),
  lowerCase: (a) => String(a).toLowerCase(),
  capitalize: (a) => { const s = String(a); return s.charAt(0).toUpperCase() + s.slice(1); },
  abs: (a) => Math.abs(Number(a)),
  ceil: (a) => Math.ceil(Number(a)),
  floor: (a) => Math.floor(Number(a)),
  round: (a) => Math.round(Number(a)),
  cos: (a) => Math.cos(Number(a)),
  sin: (a) => Math.sin(Number(a)),
  tan: (a) => Math.tan(Number(a)),
  length: (a) => (a === null || a === undefined ? 0 : (a.length !== undefined ? a.length : String(a).length)),
  convertToNumber: (a) => Number(a),
};

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function evalNode(node, scope, fns, depth) {
  if (depth > MAX_DEPTH) throw new WhenEvalError('Expression nesting too deep');

  switch (node.type) {
    case 'Literal':
      return node.value;

    case 'Identifier': {
      const name = node.name;
      if (FORBIDDEN_KEYS.has(name)) return undefined;
      return Object.prototype.hasOwnProperty.call(scope, name) ? scope[name] : undefined;
    }

    case 'Unary': {
      const v = evalNode(node.arg, scope, fns, depth + 1);
      if (node.op === '!') return !v;
      if (node.op === '-') return -Number(v);
      if (node.op === '+') return +Number(v);
      throw new WhenEvalError('Unknown unary operator: ' + node.op);
    }

    case 'Logical': {
      const l = evalNode(node.left, scope, fns, depth + 1);
      if (node.op === '&&') return l ? evalNode(node.right, scope, fns, depth + 1) : l;
      if (node.op === '||') return l ? l : evalNode(node.right, scope, fns, depth + 1);
      throw new WhenEvalError('Unknown logical operator: ' + node.op);
    }

    case 'Binary': {
      const l = evalNode(node.left, scope, fns, depth + 1);
      const r = evalNode(node.right, scope, fns, depth + 1);
      return applyBinary(node.op, l, r);
    }

    case 'Member': {
      const obj = evalNode(node.object, scope, fns, depth + 1);
      if (obj === null || obj === undefined) return undefined; // safe + handles optional chaining
      let key = node.computed ? evalNode(node.property, scope, fns, depth + 1) : node.property;
      key = String(key);
      if (FORBIDDEN_KEYS.has(key)) return undefined;
      return obj[key];
    }

    case 'Call': {
      // Only plain whitelisted identifiers may be called. This blocks any method
      // call on arbitrary objects (e.g. x.constructor(...), [].map(...)).
      if (node.callee.type !== 'Identifier') {
        throw new WhenEvalError('Only whitelisted function calls are allowed');
      }
      const fname = node.callee.name;
      const fn = fns[fname];
      if (typeof fn !== 'function') throw new WhenEvalError('Function not allowed: ' + fname);
      const args = node.args.map((a) => evalNode(a, scope, fns, depth + 1));
      return fn(...args);
    }

    default:
      throw new WhenEvalError('Unknown node type: ' + node.type);
  }
}

// ---------------------------------------------------------------------------
// Public class
// ---------------------------------------------------------------------------

class TiledeskWhenExpression {
  /**
   * @param {object} [options]
   * @param {object} [options.functions] extra/override whitelisted functions
   * @param {number} [options.maxLength] max expression length
   */
  constructor(options) {
    this.functions = Object.assign({}, DEFAULT_FUNCTIONS, options && options.functions);
    this.maxLength = (options && options.maxLength) || MAX_EXPRESSION_LENGTH;
  }

  /** Parse only (useful for validation/tests). Throws WhenSyntaxError on failure. */
  parse(expression) {
    if (typeof expression !== 'string') throw new WhenSyntaxError('expression must be a string');
    if (expression.length > this.maxLength) throw new WhenSyntaxError('expression too long');
    return new Parser(tokenize(expression)).parse();
  }

  /**
   * Evaluate a `when` expression against a variables map.
   * @returns the evaluated value (commonly a boolean).
   * @throws WhenSyntaxError on parse errors, WhenEvalError on evaluation errors.
   */
  evaluate(expression, variables) {
    const ast = this.parse(expression);
    const scope = (variables && typeof variables === 'object') ? variables : {};
    return evalNode(ast, scope, this.functions, 0);
  }

  /** Convenience: evaluate and coerce to boolean; returns null on any error. */
  evaluateAsBoolean(expression, variables) {
    try {
      const v = this.evaluate(expression, variables);
      if (v === null || v === undefined) return null;
      return Boolean(v);
    } catch (e) {
      return null;
    }
  }
}

module.exports = { TiledeskWhenExpression, WhenSyntaxError, WhenEvalError };
