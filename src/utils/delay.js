/**
 * Timing helpers used by the scraper.
 */

/** Promise-based sleep: `await sleep(1000)` pauses this async function for 1s
 *  without blocking the Node event loop (the API keeps serving requests). */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random integer in [min, max] (inclusive).
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * RANDOMIZED POLITENESS DELAY between page requests.
 *
 * WHY RANDOM, NOT FIXED?
 *  1. Rate limits: sites throttle clients that send many requests per second.
 *     Waiting 1.5-4s between pages keeps us far below typical limits.
 *  2. Bot detection: a request exactly every 2000ms is an obvious machine
 *     pattern. Jitter looks more like normal traffic.
 *  3. Courtesy: we're a guest on someone else's server.
 */
async function randomDelay(minMs, maxMs) {
  const ms = randomInt(minMs, maxMs);
  await sleep(ms);
  return ms;
}

module.exports = { sleep, randomInt, randomDelay };
