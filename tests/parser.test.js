// Run with: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseJobListings } = require('../src/scraper/parser');

const PAGE_URL = 'https://board.example.com/jobs?page=1';
const NOW = new Date('2026-10-04T12:00:00Z');
const parse = (html) => parseJobListings(html, { pageUrl: PAGE_URL, sourceName: 'test', now: NOW });

test('parses a well-formed card with primary selectors', () => {
  const { jobs, stats } = parse(`
    <div class="job-card" data-job-id="42">
      <a class="job-title" href="/jobs/42">  Backend
        Intern </a>
      <span class="company-name">Acme</span>
      <span class="job-location">Remote</span>
      <time datetime="2026-10-01T00:00:00Z">3 days ago</time>
    </div>`);

  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0], {
    externalJobId: 'test:42',
    title: 'Backend Intern', // whitespace collapsed
    company: 'Acme',
    location: 'Remote',
    applyUrl: 'https://board.example.com/jobs/42', // relative URL resolved
    postedDate: new Date('2026-10-01T00:00:00Z'),
  });
  assert.equal(stats.fallbacksUsed, 0);
});

test('falls back to legacy selectors when primary ones are missing', () => {
  const { jobs, stats } = parse(`
    <div class="job-card" data-job-id="7">
      <h3 class="title"><a href="/jobs/7">Data Intern</a></h3>
      <div class="company">Beta</div>
      <div class="location">NYC</div>
    </div>`);

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Data Intern');
  assert.equal(jobs[0].company, 'Beta');
  assert.equal(jobs[0].location, 'NYC');
  assert.ok(stats.fallbacksUsed >= 3);
});

test('skips cards missing a required field but keeps the rest', () => {
  const { jobs, stats } = parse(`
    <div class="job-card" data-job-id="1"><a class="job-title" href="/jobs/1">No company</a></div>
    <div class="job-card" data-job-id="2"><a class="job-title" href="/jobs/2">OK</a><span class="company-name">C</span></div>`);

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].externalJobId, 'test:2');
  assert.equal(stats.skipped, 1);
  assert.equal(stats.skipReasons.missing_company, 1);
});

test('uses defaults for missing optional fields', () => {
  const { jobs } = parse(`
    <div class="job-card" data-job-id="3"><a class="job-title" href="/jobs/3">T</a><span class="company-name">C</span></div>`);

  assert.equal(jobs[0].location, 'Not specified');
  assert.equal(jobs[0].postedDate, null);
});

test('derives externalJobId from URL, then from a hash, when data-job-id is missing', () => {
  const { jobs } = parse(`
    <div class="job-card"><a class="job-title" href="/jobs/999">From URL</a><span class="company-name">C</span></div>
    <div class="job-card"><a class="job-title" href="https://other.example.com/careers?id=x">From hash</a><span class="company-name">C</span></div>`);

  assert.equal(jobs[0].externalJobId, 'test:999');
  assert.match(jobs[1].externalJobId, /^test:h_[0-9a-f]{16}$/);

  // Hash must be stable across runs - otherwise every scrape would create duplicates.
  const again = parse(`
    <div class="job-card"><a class="job-title" href="https://other.example.com/careers?id=x">Renamed title</a><span class="company-name">C</span></div>`);
  assert.equal(again.jobs[0].externalJobId, jobs[1].externalJobId);
});

test('finds the next page link and resolves it to an absolute URL', () => {
  const { nextPageUrl } = parse(`<div class="pagination"><a href="?page=2">Next</a></div>`);
  assert.equal(nextPageUrl, 'https://board.example.com/jobs?page=2');
});

test('returns no next page on the last page', () => {
  const { nextPageUrl, stats } = parse('<html><body><p>No jobs</p></body></html>');
  assert.equal(nextPageUrl, null);
  assert.equal(stats.cardsFound, 0);
});

test('rejects javascript: links as apply URLs', () => {
  const { jobs, stats } = parse(`
    <div class="job-card" data-job-id="5"><a class="job-title" href="javascript:alert(1)">X</a><span class="company-name">C</span></div>`);
  assert.equal(jobs.length, 0);
  assert.equal(stats.skipReasons.missing_apply_url, 1);
});
