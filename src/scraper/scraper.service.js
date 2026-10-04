/**
 * Scraper orchestrator: walks the job board page by page.
 *
 *     for each page (up to maxPages):
 *        wait a random 1.5-4s           <- politeness / rate-limit avoidance
 *        fetch HTML (with retries)      <- httpClient.js
 *        parse cards                    <- parser.js
 *        de-duplicate within this run   <- Map keyed by externalJobId
 *        follow the "Next" link
 *
 * NETWORK FAILURE STRATEGY (page level):
 *   - Each page already gets several retries inside fetchHtml().
 *   - If a page STILL fails, we record the error and move on to the next
 *     page (graceful degradation). Partial data beats no data.
 *   - We can't read the "Next" link of a page that failed to load, so we fall
 *     back to guessing it by incrementing ?page=N.
 *   - After N consecutive page failures we stop (circuit breaker): the site
 *     is probably down or blocking us, and hammering it won't help.
 *   - Safety stops: maxPages cap, empty page, and a visited-URL set that
 *     prevents infinite pagination loops.
 *
 * DUPLICATE STRATEGY (layer 1 of 2):
 *   Boards often repeat "featured" jobs on every page. We collapse those in
 *   memory here so the DB layer receives each job exactly once per run.
 *   (Layer 2 - across runs - is the DB upsert, see ingestion service.)
 */
const config = require('../config');
const defaultLogger = require('../lib/logger');
const { fetchHtml } = require('./httpClient');
const { parseJobListings } = require('./parser');
const { randomDelay } = require('../utils/delay');

/** Fallback pagination when we couldn't read the real "Next" link. */
function guessNextPageUrl(currentUrl) {
  const url = new URL(currentUrl);
  const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
  url.searchParams.set('page', String(page + 1));
  return url.toString();
}

/**
 * Scrape the configured job board.
 *
 * @param {object} [options]
 * @param {object} [options.log]  logger (child logger with runId)
 * @param {object} [options.overrides] override config.scraper values (tests/demos)
 * @returns {Promise<{ jobs: object[], stats: object }>}  never throws for page failures
 */
async function scrapeJobBoard({ log = defaultLogger, overrides = {} } = {}) {
  const opts = { ...config.scraper, ...overrides };

  const jobsById = new Map(); // externalJobId -> job (in-run de-duplication)
  const visited = new Set();
  const stats = {
    pagesAttempted: 0,
    pagesSucceeded: 0,
    pagesFailed: 0,
    cardsFound: 0,
    cardsSkipped: 0,
    duplicatesInRun: 0,
    fallbackSelectorsUsed: 0,
    errors: [],
  };

  let url = opts.baseUrl;
  let consecutiveFailures = 0;

  while (url && stats.pagesAttempted < opts.maxPages) {
    if (visited.has(url)) {
      log.warn('Pagination loop detected, stopping', { url });
      break;
    }
    visited.add(url);

    // Randomized delay BEFORE every request except the first.
    if (stats.pagesAttempted > 0) {
      const waitedMs = await randomDelay(opts.minDelayMs, opts.maxDelayMs);
      log.debug('Politeness delay', { waitedMs });
    }

    stats.pagesAttempted++;
    const pageNumber = stats.pagesAttempted;

    try {
      const html = await fetchHtml(url, { log });
      const page = parseJobListings(html, { pageUrl: url, sourceName: opts.sourceName, log });

      stats.pagesSucceeded++;
      stats.cardsFound += page.stats.cardsFound;
      stats.cardsSkipped += page.stats.skipped;
      stats.fallbackSelectorsUsed += page.stats.fallbacksUsed;
      consecutiveFailures = 0;

      for (const job of page.jobs) {
        if (jobsById.has(job.externalJobId)) stats.duplicatesInRun++;
        jobsById.set(job.externalJobId, job); // later copy wins (freshest data)
      }

      log.info('Scraped page', {
        page: pageNumber,
        url,
        cards: page.stats.cardsFound,
        parsed: page.stats.parsed,
        skipped: page.stats.skipped,
      });

      if (page.stats.cardsFound === 0) {
        log.info('Empty page - reached the end of listings', { url });
        break;
      }
      url = page.nextPageUrl; // null => last page
    } catch (err) {
      stats.pagesFailed++;
      consecutiveFailures++;
      stats.errors.push({
        url,
        message: err.message,
        status: err.response?.status ?? null,
        code: err.code ?? null,
        attempts: err.attempts ?? 1,
      });
      log.error('Page failed after retries', {
        page: pageNumber,
        url,
        status: err.response?.status,
        attempts: err.attempts,
        err,
      });

      if (consecutiveFailures >= opts.maxConsecutiveFailures) {
        log.error('Circuit breaker: too many consecutive page failures, aborting scrape', {
          consecutiveFailures,
        });
        break;
      }
      url = guessNextPageUrl(url);
    }
  }

  return { jobs: [...jobsById.values()], stats };
}

module.exports = { scrapeJobBoard, guessNextPageUrl };
