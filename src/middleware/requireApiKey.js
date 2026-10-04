/**
 * Protects expensive/admin endpoints (like triggering a scrape) with an API key.
 *
 * WHY: POST /api/scrape/trigger makes our server send many requests to a
 * third-party site. Left open, anyone could spam it and get our IP banned.
 *
 * Client sends:   x-api-key: <SCRAPE_API_KEY>
 *
 * We compare with crypto.timingSafeEqual instead of `===`. A normal string
 * comparison returns as soon as one character differs, so an attacker can
 * measure response times to guess the key character by character
 * (a "timing attack"). timingSafeEqual always takes the same time.
 */
const crypto = require('node:crypto');
const config = require('../config');
const logger = require('../lib/logger');
const { HttpError } = require('./errorHandler');

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual requires equal lengths; length mismatch => not equal.
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

let warned = false;

function requireApiKey(req, res, next) {
  const expected = config.security.scrapeApiKey;

  if (!expected) {
    // Convenient for local development, dangerous in production.
    if (config.env === 'production') {
      return next(new HttpError(503, 'SCRAPE_API_KEY is not configured'));
    }
    if (!warned) {
      logger.warn('SCRAPE_API_KEY not set - scrape trigger is unprotected (dev only)');
      warned = true;
    }
    return next();
  }

  const provided = req.get('x-api-key') || '';
  if (!safeEqual(provided, expected)) {
    return next(new HttpError(401, 'Invalid or missing x-api-key header'));
  }
  next();
}

module.exports = { requireApiKey };
