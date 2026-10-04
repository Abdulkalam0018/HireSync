/**
 * Centralised error handling for Express.
 *
 * Express 5 automatically forwards errors thrown in async route handlers
 * to the error middleware (Express 4 needed try/catch or a wrapper), so our
 * controllers can just `throw new HttpError(400, '...')`.
 *
 * Every error leaves the API in the SAME JSON shape:
 *   { "error": { "message": "...", "details": ... } }
 * Clients only need one code path to handle failures.
 */
const logger = require('../lib/logger');
const config = require('../config');

/** An error that knows which HTTP status it should produce. */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** 404 for any route that didn't match. */
function notFound(req, res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/** Final error handler. Must have 4 args so Express recognises it. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON body -> 400 rather than 500.
  if (err.type === 'entity.parse.failed') {
    err = new HttpError(400, 'Invalid JSON body');
  }

  const status = err.status || 500;

  if (status >= 500) {
    logger.error('Unhandled request error', { method: req.method, url: req.originalUrl, err });
  }

  res.status(status).json({
    error: {
      // Never leak internal error messages/stack traces to clients in production.
      message:
        status >= 500 && config.env === 'production' ? 'Internal server error' : err.message,
      ...(err.details && { details: err.details }),
    },
  });
}

module.exports = { HttpError, notFound, errorHandler };
