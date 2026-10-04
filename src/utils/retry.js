/**
 * Retry with EXPONENTIAL BACKOFF + JITTER.
 *
 * NETWORK FAILURE HANDLING (key interview point)
 * ------------------------------------------------
 * Networks fail all the time: DNS hiccups, dropped connections, a server
 * briefly returning 503 during a deploy. Most of these are TRANSIENT - the
 * same request a few seconds later succeeds. So we retry, but carefully:
 *
 *  1. Only retry errors that CAN succeed later (timeouts, connection resets,
 *     HTTP 429 / 5xx). A 404 or 403 will fail forever, so retrying just wastes
 *     time and annoys the server.
 *
 *  2. Exponential backoff: wait 1s, 2s, 4s, 8s... A struggling server gets
 *     more breathing room on each attempt instead of being hammered.
 *
 *  3. Jitter: add randomness to each wait. If 1,000 clients all failed at the
 *     same moment, without jitter they'd all retry at the same moment too
 *     (the "thundering herd" problem) and knock the server over again.
 *
 *  4. Respect `Retry-After`: on 429 (Too Many Requests) the server tells us
 *     how long to wait. We obey it.
 *
 *  5. Bounded attempts: after `maxRetries` we give up and surface the error so
 *     the caller can decide what to do (e.g. skip this page).
 */
const { sleep } = require('./delay');

// Low-level Node/axios error codes that indicate a transient network problem.
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET', // connection dropped mid-request
  'ECONNREFUSED', // server not accepting connections (restarting?)
  'ETIMEDOUT', // TCP connect timeout
  'ECONNABORTED', // axios request timeout
  'EAI_AGAIN', // temporary DNS failure
  'ENOTFOUND', // DNS lookup failed (can be transient on flaky networks)
  'EPIPE',
  'ERR_NETWORK',
]);

/**
 * Decide whether an error is worth retrying.
 * Works with axios errors (err.response.status / err.code).
 */
function isRetryableError(err) {
  const status = err?.response?.status;
  if (status !== undefined) {
    // 408 Request Timeout, 429 Too Many Requests, 5xx server errors.
    return status === 408 || status === 429 || status >= 500;
  }
  // No HTTP response at all -> network-level failure.
  return RETRYABLE_ERROR_CODES.has(err?.code);
}

/**
 * Parse the Retry-After header (seconds or HTTP date) into milliseconds.
 */
function getRetryAfterMs(err) {
  const header = err?.response?.headers?.['retry-after'];
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

/**
 * Compute the wait before retry number `attempt` (1-based).
 * "Full jitter" strategy: random value between 0 and the exponential cap.
 */
function computeBackoffMs(attempt, baseDelayMs, maxDelayMs) {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(exponential / 2 + Math.random() * (exponential / 2));
}

/**
 * Run `fn` and retry it on transient failures.
 *
 * @param {(attempt:number) => Promise<T>} fn  The operation to attempt.
 * @param {object} options
 * @param {number} [options.maxRetries=3]     Retries AFTER the first attempt.
 * @param {number} [options.baseDelayMs=1000]
 * @param {number} [options.maxDelayMs=15000]
 * @param {(err:Error, attempt:number, waitMs:number) => void} [options.onRetry]
 * @returns {Promise<T>}
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 15000,
    shouldRetry = isRetryableError,
    onRetry = () => {},
  } = options;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      const attemptsLeft = attempt <= maxRetries;
      if (!attemptsLeft || !shouldRetry(err)) {
        err.attempts = attempt;
        throw err; // permanent error, or out of retries -> let caller handle
      }
      const waitMs = getRetryAfterMs(err) ?? computeBackoffMs(attempt, baseDelayMs, maxDelayMs);
      onRetry(err, attempt, waitMs);
      await sleep(waitMs);
    }
  }
}

module.exports = { withRetry, isRetryableError, computeBackoffMs, getRetryAfterMs };
