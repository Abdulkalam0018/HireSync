/**
 * MOCK JOB BOARD - a tiny server-rendered "YC-style" jobs site.
 *
 * WHY: Scraping a real site during development is slow, flaky, and impolite
 * (every test run hits their servers). A local mock gives us:
 *   - deterministic, offline development and demos;
 *   - control over edge cases (broken markup, missing fields);
 *   - controllable failures (MOCK_FAIL_RATE) to PROVE the retry logic works.
 *
 * To scrape a real board later, set SCRAPE_BASE_URL and update selectors.js.
 *
 * Routes (mounted at /mock-board):
 *   GET /mock-board/jobs?page=N   listing page, 8 jobs per page
 *   GET /mock-board/jobs/:id      job detail page (the "apply" target)
 */
const { Router } = require('express');
const config = require('../config');
const fixtures = require('./fixtures');

const PAGE_SIZE = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Escape text before putting it into HTML (prevents HTML injection). */
function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderPosted(posted) {
  if (!posted) return '';
  if (posted.daysAgo !== undefined) {
    const iso = new Date(Date.now() - posted.daysAgo * DAY_MS).toISOString();
    return `<time class="job-posted" datetime="${iso}">${posted.daysAgo}d ago</time>`;
  }
  return `<span class="posted-at">${esc(posted.relative || posted.text)}</span>`;
}

/** Current markup. */
function renderModernCard(job) {
  const idAttr = job.noId ? '' : ` data-job-id="${job.id}"`;
  return `
    <div class="job-card"${idAttr}>
      <a class="job-title" href="/mock-board/jobs/${job.id}">${esc(job.title)}</a>
      ${job.company ? `<span class="company-name">${esc(job.company)}</span>` : ''}
      ${job.location ? `<span class="job-location">${esc(job.location)}</span>` : ''}
      ${renderPosted(job.posted)}
    </div>`;
}

/** Old markup from "before the redesign": different class names. */
function renderLegacyCard(job) {
  const idAttr = job.noId ? '' : ` data-job-id="${job.id}"`;
  return `
    <div class="job-card"${idAttr}>
      <h3 class="title"><a href="/mock-board/jobs/${job.id}">${esc(job.title)}</a></h3>
      ${job.company ? `<div class="company">${esc(job.company)}</div>` : ''}
      ${job.location ? `<div class="location">${esc(job.location)}</div>` : ''}
      ${renderPosted(job.posted)}
    </div>`;
}

function renderCard(job) {
  return job.layout === 'legacy' ? renderLegacyCard(job) : renderModernCard(job);
}

const router = Router();

// Simulated outages: randomly answer 503 so we can watch retries happen.
router.use((req, res, next) => {
  if (config.mockBoard.failRate > 0 && Math.random() < config.mockBoard.failRate) {
    return res.status(503).set('Retry-After', '1').type('text/plain').send('Service Unavailable');
  }
  next();
});

router.get('/jobs', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const regular = fixtures.filter((j) => !j.featured);
  const featured = fixtures.filter((j) => j.featured);
  const totalPages = Math.ceil(regular.length / PAGE_SIZE);
  const pageJobs = regular.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Featured jobs are pinned to the top of every page (like real boards do),
  // which produces duplicates across pages for the scraper to collapse.
  const cards = pageJobs.length ? [...featured, ...pageJobs].map(renderCard).join('\n') : '';
  const next = page < totalPages ? `<a class="next" href="/mock-board/jobs?page=${page + 1}">Next</a>` : '';

  res.type('html').send(`<!doctype html>
<html>
<head><meta charset="utf-8"><title>Mock Startup Jobs - Page ${page}</title></head>
<body>
  <h1>Startup Internships</h1>
  <div class="jobs-list">${cards}</div>
  <nav class="pagination">${next}</nav>
</body>
</html>`);
});

router.get('/jobs/:id', (req, res) => {
  const job = fixtures.find((j) => String(j.id) === req.params.id);
  if (!job) return res.status(404).type('html').send('<h1>Job not found</h1>');
  res.type('html').send(
    `<!doctype html><html><body><h1>${esc(job.title)}</h1><p>${esc(job.company || '')}</p><button>Apply</button></body></html>`
  );
});

module.exports = router;
