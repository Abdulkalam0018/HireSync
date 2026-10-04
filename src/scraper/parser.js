/**
 * HTML -> structured job objects (Cheerio).
 *
 * Cheerio parses an HTML string into a jQuery-like tree that we can query with
 * CSS selectors. It does NOT run JavaScript or render the page - that's why it
 * is ~100x lighter and faster than a headless browser (Puppeteer/Playwright),
 * and why we target server-rendered job boards.
 *
 * This module is a PURE FUNCTION of its inputs (no network, no DB, no config),
 * which makes it trivial to unit test with saved HTML fixtures.
 *
 * FAILURE HANDLING inside a page:
 *   - Missing optional field (location, date) -> use a safe default.
 *   - Missing required field (title, company, applyUrl) -> skip ONLY that card.
 *   - Unexpected exception in one card -> caught, logged, other cards continue.
 *   - Zero cards matched -> warn loudly: the site layout probably changed.
 */
const cheerio = require('cheerio');
const crypto = require('node:crypto');
const SELECTORS = require('./selectors');
const { parsePostedDate } = require('./dateParser');

// Mirror the VARCHAR limits in schema.prisma so one oversized value can't
// make the database reject the whole row.
const MAX_LEN = { title: 300, company: 200, location: 200, applyUrl: 2048 };
const DEFAULT_LOCATION = 'Not specified';

/** Collapse whitespace/newlines: "  Backend\n   Intern " -> "Backend Intern". */
function cleanText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function truncate(value, max) {
  return value && value.length > max ? value.slice(0, max) : value;
}

/**
 * THE FALLBACK MECHANISM: try each selector in priority order and return the
 * first element that exists. `index > 0` means a fallback selector was used.
 */
function findFirst($scope, selectors) {
  for (let index = 0; index < selectors.length; index++) {
    const el = $scope.find(selectors[index]).first();
    if (el.length) return { el, index };
  }
  return null;
}

/** Resolve relative links ("/jobs/1") against the page URL; reject non-http(s). */
function toAbsoluteUrl(href, pageUrl) {
  if (!href) return null;
  try {
    const url = new URL(href, pageUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Work out a STABLE identity for the job. This is the de-duplication key, so
 * it must be the same every time we scrape the same job.
 *
 *   1. The site's own ID (data-job-id attribute)         - best
 *   2. Numeric ID inside the job URL (/jobs/1234)          - very good
 *   3. SHA-256 hash of the apply URL                       - fallback
 *
 * We hash the URL, not the title, because titles get edited ("Intern" ->
 * "Summer Intern") while URLs rarely change. Hashing the title would turn
 * every edit into a "new" job = a duplicate row.
 *
 * The ID is prefixed with the source name ("mockyc:1001") so job #1001 on
 * site A never collides with job #1001 on site B.
 */
function resolveExternalId($card, applyUrl, sourceName) {
  let rawId = cleanText($card.attr('data-job-id') || $card.attr('data-id'));

  if (!rawId && applyUrl) {
    const match = new URL(applyUrl).pathname.match(/\/jobs?\/([\w-]+)/);
    if (match) rawId = match[1];
  }

  if (!rawId && applyUrl) {
    rawId = 'h_' + crypto.createHash('sha256').update(applyUrl).digest('hex').slice(0, 16);
  }

  return rawId ? `${sourceName}:${rawId}` : null;
}

/**
 * Parse a single job card. Returns { job } on success or { skipReason }.
 */
function parseCard($card, { pageUrl, sourceName, now, stats }) {
  const pick = (selectors) => {
    const found = findFirst($card, selectors);
    if (!found) return null;
    if (found.index > 0) stats.fallbacksUsed++;
    return found.el;
  };

  // ---- Required fields ---------------------------------------------------
  const title = cleanText(pick(SELECTORS.title)?.text());
  // Extra fallback: some layouts put the company in a data attribute.
  const company =
    cleanText(pick(SELECTORS.company)?.text()) || cleanText($card.attr('data-company'));
  const applyUrl = toAbsoluteUrl(pick(SELECTORS.applyLink)?.attr('href'), pageUrl);

  if (!title) return { skipReason: 'missing_title' };
  if (!company) return { skipReason: 'missing_company' };
  if (!applyUrl) return { skipReason: 'missing_apply_url' };

  // ---- Optional fields (safe defaults) ----------------------------------
  const location = cleanText(pick(SELECTORS.location)?.text()) || DEFAULT_LOCATION;
  const dateEl = pick(SELECTORS.postedDate);
  const postedDate = dateEl ? parsePostedDate(dateEl.attr('datetime'), dateEl.text(), now) : null;

  const externalJobId = resolveExternalId($card, applyUrl, sourceName);
  if (!externalJobId) return { skipReason: 'missing_id' };

  return {
    job: {
      externalJobId: truncate(externalJobId, 255),
      title: truncate(title, MAX_LEN.title),
      company: truncate(company, MAX_LEN.company),
      location: truncate(location, MAX_LEN.location),
      applyUrl: truncate(applyUrl, MAX_LEN.applyUrl),
      postedDate,
    },
  };
}

/**
 * Parse one listing page.
 *
 * @param {string} html
 * @param {object} options
 * @param {string} options.pageUrl     URL the HTML came from (for resolving links)
 * @param {string} options.sourceName  namespace for externalJobId
 * @param {object} [options.log]
 * @param {Date}   [options.now]       injectable clock for tests
 * @returns {{ jobs: object[], nextPageUrl: string|null, stats: object }}
 */
function parseJobListings(html, { pageUrl, sourceName, log, now = new Date() }) {
  const $ = cheerio.load(html);
  const stats = { cardsFound: 0, parsed: 0, skipped: 0, fallbacksUsed: 0, skipReasons: {} };
  const jobs = [];

  // Find job cards using the first card selector that matches anything.
  let $cards = $([]);
  for (const selector of SELECTORS.jobCard) {
    $cards = $(selector);
    if ($cards.length) break;
  }
  stats.cardsFound = $cards.length;

  $cards.each((i, element) => {
    try {
      const result = parseCard($(element), { pageUrl, sourceName, now, stats });
      if (result.job) {
        jobs.push(result.job);
        stats.parsed++;
      } else {
        stats.skipped++;
        stats.skipReasons[result.skipReason] = (stats.skipReasons[result.skipReason] || 0) + 1;
        log?.debug('Skipped job card', { pageUrl, cardIndex: i, reason: result.skipReason });
      }
    } catch (err) {
      // One malformed card must never kill the whole page.
      stats.skipped++;
      stats.skipReasons.exception = (stats.skipReasons.exception || 0) + 1;
      log?.warn('Error parsing job card', { pageUrl, cardIndex: i, err });
    }
  });

  // Cards exist but none parsed -> field selectors are probably outdated.
  if (stats.cardsFound > 0 && stats.parsed === 0) {
    log?.warn('Found job cards but parsed none - selectors may be outdated', { pageUrl, stats });
  }

  // Pagination: follow the site's own "Next" link rather than guessing URLs.
  const next = findFirst($.root(), SELECTORS.nextPage);
  let nextPageUrl = next ? toAbsoluteUrl(next.el.attr('href'), pageUrl) : null;
  if (nextPageUrl === pageUrl) nextPageUrl = null; // self-link guard

  return { jobs, nextPageUrl, stats };
}

module.exports = { parseJobListings, resolveExternalId, toAbsoluteUrl, cleanText };
