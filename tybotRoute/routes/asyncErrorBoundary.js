const winston = require('../utils/winston.js');

/**
 * An error boundary for express route handlers.
 *
 * Express 4 does not await a handler: an `async (req, res) => {...}` that
 * throws (or awaits something that rejects) produces a REJECTED PROMISE NOBODY
 * HOLDS. Two things follow, and both were observed on this router:
 *
 *   - the client is never answered. The socket stays open until it times out,
 *     because no `res.send` ever runs and express's own error middleware is
 *     never reached (it only sees errors passed to `next`, or thrown
 *     synchronously);
 *   - the process dies. Node's default is --unhandled-rejections=throw, so one
 *     malformed POST to a public endpoint takes the whole worker down with it.
 *
 * `guardRouter` returns a thin stand-in for the router whose verb methods wrap
 * the handlers they are given, so a rejection becomes a logged 500 instead.
 * Registration order, paths and handler arity are untouched; a handler that
 * already answered keeps its answer (only the error is logged).
 *
 * This is a boundary, not a substitute for handling errors where they happen:
 * a route that knows what a bad request looks like should still answer 400
 * itself. It is what stops the ones nobody predicted from being fatal.
 */

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all', 'use'];

function report(err, req, res) {
  const where = req && req.method ? `${req.method} ${req.originalUrl || req.url}` : 'a route';
  winston.error(`(tybotRoute) Unhandled error in ${where}: `, err);
  if (!res || res.headersSent) {
    return;
  }
  try {
    res.status(500).send({ success: false, error: "Internal error" });
  }
  catch (sendError) {
    winston.error("(tybotRoute) Could not answer after an unhandled error: ", sendError);
  }
}

/**
 * Wrap one handler. Non-functions (a nested router handed to `use`, a path
 * string) are passed through untouched.
 */
function guardHandler(handler) {
  if (typeof handler !== 'function') {
    return handler;
  }
  // Express reads handler.length to tell an error handler (4 args) from a
  // normal one (<= 3). Keep the arity the caller declared.
  if (handler.length >= 4) {
    return function (err, req, res, next) {
      let result;
      try {
        result = handler.call(this, err, req, res, next);
      }
      catch (thrown) {
        report(thrown, req, res);
        return undefined;
      }
      if (result && typeof result.then === 'function') {
        return Promise.resolve(result).catch((rejected) => report(rejected, req, res));
      }
      return result;
    };
  }
  return function (req, res, next) {
    let result;
    try {
      result = handler.call(this, req, res, next);
    }
    catch (thrown) {
      report(thrown, req, res);
      return undefined;
    }
    if (result && typeof result.then === 'function') {
      return Promise.resolve(result).catch((rejected) => report(rejected, req, res));
    }
    return result;
  };
}

/**
 * @param {object} router  an express Router
 * @returns {object} a stand-in that registers guarded handlers on `router`
 */
function guardRouter(router) {
  const guarded = {};
  for (const method of METHODS) {
    if (typeof router[method] !== 'function') continue;
    guarded[method] = (...args) => router[method](...args.map(guardHandler));
  }
  return guarded;
}

module.exports = { guardRouter, guardHandler };
