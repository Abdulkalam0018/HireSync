/**
 * HTTP client for the scraper (Axios).
 *
 * Responsibilities: fetch ONE page of HTML reliably.
 *   - Hard timeout: a hung server must never hang our whole pipeline.
 *   - Honest User-Agent + browser-like Accept headers.
 *   - Automatic retries for transient failures (see utils/retry.js).
 *   - Sanity check that we actually got HTML (not a JSON error / CAPTCHA blob).
 *
 * Parsing is deliberately NOT done here (single responsibility): this module
 * knows about networks, `parser.js` knows about HTML.
 */
const axios = require('axios');
const config = require('../config');
const { withRetry } = require('../utils/retry');

const http = axios.create({
  timeout: config.scraper.timeoutMs, // abort if the server takes too long
  maxRedirects: 5,
  responseType: 'text',
  maxContentLength: 5 * 1024 * 1024, // 5 MB - protects memory from huge/hostile responses
  headers: {
    'User-Agent': config.scraper.userAgent,
    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  },
  // Default axios behaviour: any non-2xx status rejects the promise,
  // which is exactly what lets withRetry() inspect the status code.
});

/**
 * Fetch a URL and return its HTML body, retrying transient failures.
 *
 * @param {string} url
 * @param {{ log?: object }} [options]
 * @returns {Promise<string>} raw HTML
 * @throws after retries are exhausted, or immediately on permanent errors (404, 403...)
 */
async function fetchHtml(url, { log } = {}) {
  const response = await withRetry(() => http.get(url), {
    maxRetries: config.scraper.maxRetries,
    baseDelayMs: 1000,
    maxDelayMs: 15000,
    onRetry: (err, attempt, waitMs) => {
      log?.warn('Request failed, will retry', {
        url,
        attempt,
        waitMs,
        status: err.response?.status,
        code: err.code,
      });
    },
  });

  const contentType = String(response.headers['content-type'] || '');
  if (!contentType.includes('html')) {
    // 200 OK but not HTML usually means a bot wall or an API error page.
    const err = new Error(`Expected HTML but received "${contentType || 'unknown'}"`);
    err.code = 'UNEXPECTED_CONTENT_TYPE';
    throw err;
  }

  return response.data;
}

module.exports = { fetchHtml };
