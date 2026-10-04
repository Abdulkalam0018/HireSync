/**
 * Turn the many ways job boards display dates into a real Date (or null).
 *
 * Strategy, from most to least reliable:
 *   1. Machine-readable attribute:  <time datetime="2026-10-01T00:00:00Z">
 *   2. Relative text:               "3 days ago", "an hour ago", "yesterday"
 *   3. Absolute text:               "Sep 28, 2026", "2026-09-28"
 *   4. Give up -> null. We never invent a date; a wrong date is worse than
 *      no date because it silently corrupts "newest jobs" sorting/filtering.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const UNIT_MS = {
  minute: MINUTE,
  min: MINUTE,
  hour: HOUR,
  hr: HOUR,
  day: DAY,
  week: 7 * DAY,
  month: 30 * DAY, // approximation - fine for "how fresh is this posting"
};

function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * @param {string|null|undefined} datetimeAttr value of a `datetime` attribute, if any
 * @param {string|null|undefined} text visible text, e.g. "3 days ago"
 * @param {Date} [now] injectable "current time" so tests are deterministic
 * @returns {Date|null}
 */
function parsePostedDate(datetimeAttr, text, now = new Date()) {
  // 1. Machine-readable attribute
  if (datetimeAttr) {
    const d = new Date(datetimeAttr);
    if (isValidDate(d)) return d;
  }

  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (!t) return null;

  // 2a. Keywords
  if (t === 'just now' || t === 'today' || t === 'new') return new Date(now.getTime());
  if (t === 'yesterday') return new Date(now.getTime() - DAY);

  // 2b. "<n> <unit>(s) ago" - also handles "an hour ago", "30+ days ago", "2 hrs ago"
  const rel = t.match(/(\d+|an?)\+?\s*(minute|min|hour|hr|day|week|month)s?\s+ago/);
  if (rel) {
    const amount = rel[1].startsWith('a') ? 1 : Number.parseInt(rel[1], 10);
    return new Date(now.getTime() - amount * UNIT_MS[rel[2]]);
  }

  // 3. Absolute date text
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) return new Date(parsed);

  // 4. Unknown format
  return null;
}

module.exports = { parsePostedDate };
