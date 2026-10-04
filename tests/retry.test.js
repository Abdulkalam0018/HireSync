const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withRetry, isRetryableError, computeBackoffMs, getRetryAfterMs } = require('../src/utils/retry');

const httpError = (status, headers = {}) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, headers } });
const netError = (code) => Object.assign(new Error(code), { code });

test('classifies transient vs permanent errors', () => {
  assert.equal(isRetryableError(httpError(503)), true);
  assert.equal(isRetryableError(httpError(500)), true);
  assert.equal(isRetryableError(httpError(429)), true);
  assert.equal(isRetryableError(netError('ECONNRESET')), true);
  assert.equal(isRetryableError(netError('ECONNABORTED')), true); // axios timeout

  assert.equal(isRetryableError(httpError(404)), false);
  assert.equal(isRetryableError(httpError(403)), false);
  assert.equal(isRetryableError(new Error('bug in our code')), false);
});

test('retries transient failures and then succeeds', async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw httpError(503);
      return 'ok';
    },
    { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 }
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('does NOT retry permanent errors', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw httpError(404);
      },
      { maxRetries: 3, baseDelayMs: 1 }
    ),
    /HTTP 404/
  );
  assert.equal(calls, 1);
});

test('gives up after maxRetries and reports attempts', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw netError('ETIMEDOUT');
      },
      { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2 }
    ),
    (err) => err.attempts === 3
  );
  assert.equal(calls, 3); // 1 attempt + 2 retries
});

test('backoff grows exponentially and is capped', () => {
  for (let i = 0; i < 50; i++) {
    const first = computeBackoffMs(1, 1000, 15000);
    const fourth = computeBackoffMs(4, 1000, 15000);
    const tenth = computeBackoffMs(10, 1000, 15000);
    assert.ok(first >= 500 && first <= 1000);
    assert.ok(fourth >= 4000 && fourth <= 8000);
    assert.ok(tenth <= 15000);
  }
});

test('honours the Retry-After header', () => {
  assert.equal(getRetryAfterMs(httpError(429, { 'retry-after': '2' })), 2000);
  assert.equal(getRetryAfterMs(httpError(503)), null);
});
