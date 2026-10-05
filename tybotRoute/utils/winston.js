require('dotenv').config();
var appRoot = require('app-root-path');
var winston = require('winston');
var level = process.env.LOG_LEVEL || "info";

const SECRET_KEY = /^(authorization|token|x-api-key|apikey|api_key|gptkey|password|secret)$/i;
const SECRET_TOKEN = /\b(JWT|Bearer)\s+[A-Za-z0-9._~+\/=-]+/g;
const MAX_DEPTH = 8;
const MAX_NODES = 5000;

function redactString(str) {
  return str.replace(SECRET_TOKEN, '$1 [REDACTED]');
}

// Returns a redacted COPY of value: the caller's objects are never mutated.
function redactValue(value, depth, ancestors, budget) {
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date || Buffer.isBuffer(value)) {
    return value;
  }
  if (ancestors.has(value)) {
    return '[Circular]';
  }
  if (depth >= MAX_DEPTH || budget.nodes-- <= 0) {
    return '[Truncated]';
  }
  ancestors.add(value);
  let out;
  if (Array.isArray(value)) {
    out = value.map((v) => redactValue(v, depth + 1, ancestors, budget));
  }
  else {
    out = {};
    if (value instanceof Error) {
      // message and stack are not enumerable on Error
      out.name = value.name;
      out.message = redactString(String(value.message));
      if (value.stack) {
        out.stack = redactString(String(value.stack));
      }
    }
    for (const key of Object.keys(value)) {
      if (SECRET_KEY.test(key)) {
        out[key] = '[REDACTED]';
      }
      else {
        let v;
        try { v = value[key]; } catch (e) { v = '[Unreadable]'; }
        out[key] = redactValue(v, depth + 1, ancestors, budget);
      }
    }
  }
  ancestors.delete(value);
  return out;
}

const redactSecrets = winston.format((info) => {
  const budget = { nodes: MAX_NODES };
  const ancestors = new Set();
  const out = {};
  for (const key of Object.keys(info)) {
    if (SECRET_KEY.test(key)) {
      out[key] = '[REDACTED]';
    }
    else {
      out[key] = redactValue(info[key], 0, ancestors, budget);
    }
  }
  // keep winston's internal symbols (LEVEL, ...) and redact the splat args
  for (const sym of Object.getOwnPropertySymbols(info)) {
    out[sym] = sym === Symbol.for('splat')
      ? redactValue(info[sym], 0, ancestors, budget)
      : info[sym];
  }
  return out;
});

var options = {
  file: {
    level:level ,
    filename: `${appRoot}/logs/app.log`,
    handleExceptions: true,
    json: false,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    colorize: false,
    format: winston.format.combine(redactSecrets(), winston.format.simple())
  },
  console: {
    level: level,
    handleExceptions: true,
    json: true,
    colorize: true,
    // timestamp: true,
    format: winston.format.combine(redactSecrets(), winston.format.simple())     
  },
};

let logger = winston.createLogger({    
  transports: [
   new (winston.transports.Console)(options.console),
   new (winston.transports.File)(options.file),
  ],
  exitOnError: false, // do not exit on handled exceptions
});

logger.stream = {
  write: function(message, encoding) {
    logger.info(message);
  },
};


module.exports = logger;
module.exports.redactSecrets = redactSecrets;
