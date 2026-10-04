const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePostedDate } = require('../src/scraper/dateParser');

const NOW = new Date('2026-10-04T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

test('prefers the machine-readable datetime attribute', () => {
  assert.deepEqual(
    parsePostedDate('2026-09-30T10:00:00Z', '5 days ago', NOW),
    new Date('2026-09-30T10:00:00Z')
  );
});

test('parses relative dates', () => {
  assert.deepEqual(parsePostedDate(null, '3 days ago', NOW), new Date(NOW - 3 * DAY));
  assert.deepEqual(parsePostedDate(null, 'an hour ago', NOW), new Date(NOW - 60 * 60 * 1000));
  assert.deepEqual(parsePostedDate(null, '2 weeks ago', NOW), new Date(NOW - 14 * DAY));
  assert.deepEqual(parsePostedDate(null, '30+ days ago', NOW), new Date(NOW - 30 * DAY));
  assert.deepEqual(parsePostedDate(null, 'Yesterday', NOW), new Date(NOW - DAY));
  assert.deepEqual(parsePostedDate(null, 'today', NOW), NOW);
});

test('falls back to the text when the attribute is invalid', () => {
  assert.deepEqual(parsePostedDate('not-a-date', '1 day ago', NOW), new Date(NOW - DAY));
});

test('parses absolute dates', () => {
  assert.deepEqual(parsePostedDate(null, '2026-09-28', NOW), new Date('2026-09-28'));
});

test('returns null instead of guessing', () => {
  assert.equal(parsePostedDate(null, 'Posted recently', NOW), null);
  assert.equal(parsePostedDate(null, '', NOW), null);
  assert.equal(parsePostedDate(undefined, undefined, NOW), null);
});
