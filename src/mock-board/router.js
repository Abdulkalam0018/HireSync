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
  if (!job) {
    return res.status(404).type('html').send(`
      <!doctype html><html><body style="background:#090d16;color:#fff;font-family:system-ui;text-align:center;padding:5rem;">
        <h2>Job Not Found</h2>
        <p><a href="/" style="color:#818cf8;">← Back to HireSync</a></p>
      </body></html>
    `);
  }

  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Apply for ${esc(job.title)} — ${esc(job.company || 'Startup')}</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #090d16;
      background-image: radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.12) 0px, transparent 50%),
                        radial-gradient(at 100% 100%, rgba(168, 85, 247, 0.1) 0px, transparent 50%);
      color: #f1f5f9;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2.5rem 1rem;
    }
    .card {
      background: rgba(18, 24, 38, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      padding: 2.5rem;
      max-width: 620px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(12px);
    }
    .back-link {
      display: inline-block;
      color: #94a3b8;
      text-decoration: none;
      font-size: 0.88rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
      transition: color 0.2s;
    }
    .back-link:hover { color: #818cf8; }
    .company { font-size: 1rem; color: #818cf8; font-weight: 700; margin-bottom: 0.3rem; }
    .title { font-size: 1.85rem; font-weight: 800; line-height: 1.25; margin-bottom: 1rem; letter-spacing: -0.02em; }
    .tags { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .tag { font-size: 0.8rem; font-weight: 600; padding: 0.3rem 0.75rem; border-radius: 8px; background: rgba(255, 255, 255, 0.06); color: #cbd5e1; }
    .desc { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 1.25rem; }
    
    /* Form Styles */
    .form-group { margin-bottom: 1.25rem; }
    .form-label { display: block; font-size: 0.86rem; font-weight: 600; color: #cbd5e1; margin-bottom: 0.4rem; }
    .form-input {
      width: 100%;
      padding: 0.75rem 1rem;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      color: #fff;
      font-family: inherit;
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .form-input:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
    }
    .file-input {
      padding: 0.6rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px dashed rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      width: 100%;
      color: #94a3b8;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .btn {
      width: 100%;
      padding: 0.9rem;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
      color: #fff;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      margin-top: 1rem;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4); }
    
    /* Confirmation State */
    .confirmation {
      display: none;
      text-align: center;
      padding: 2rem 1rem;
    }
    .confirmation-icon { font-size: 3.5rem; margin-bottom: 1rem; animation: pop 0.4s ease; }
    .confirmation-title { font-size: 1.6rem; font-weight: 800; margin-bottom: 0.5rem; color: #fff; }
    .confirmation-desc { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem; }
    .return-btn {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.9rem;
      transition: background 0.2s;
    }
    .return-btn:hover { background: rgba(255, 255, 255, 0.15); }
    @keyframes pop {
      0% { transform: scale(0.5); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
  </style>
</head>
<body>
  <div class="card">
    <a href="/" class="back-link">← Back to HireSync</a>
    
    <div id="applicationView">
      <div class="company">${esc(job.company || 'Tech Startup')}</div>
      <h1 class="title">${esc(job.title)}</h1>
      <div class="tags">
        <span class="tag">📍 ${esc(job.location || 'Remote')}</span>
        <span class="tag">💼 Internship</span>
        <span class="tag">⚡ Summer / Fall 2026</span>
      </div>
      <div class="desc">
        We are looking for a motivated <strong>${esc(job.title)}</strong> to join our engineering team. 
        You will work on production systems, build scalable features, and collaborate directly with senior mentors.
      </div>

      <form id="applyForm" onsubmit="handleSubmit(event)">
        <div class="form-group">
          <label class="form-label" for="fullName">Full Name *</label>
          <input class="form-input" id="fullName" type="text" placeholder="e.g. Alex Johnson" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="email">Email Address *</label>
          <input class="form-input" id="email" type="email" placeholder="alex@example.com" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="linkedin">LinkedIn / GitHub Profile *</label>
          <input class="form-input" id="linkedin" type="url" placeholder="https://linkedin.com/in/..." required>
        </div>
        <div class="form-group">
          <label class="form-label" for="resume">Upload Resume (PDF, DOCX) *</label>
          <input class="file-input" id="resume" type="file" accept=".pdf,.doc,.docx" required>
        </div>
        <button type="submit" class="btn" id="submitBtn">Submit Application</button>
      </form>
    </div>

    <div class="confirmation" id="confirmationView">
      <div class="confirmation-icon">🎉</div>
      <h2 class="confirmation-title">Application Submitted!</h2>
      <p class="confirmation-desc" id="confirmText">
        Thank you! Your application for <strong>${esc(job.title)}</strong> at <strong>${esc(job.company || 'our team')}</strong> has been received.
      </p>
      <a href="/" class="return-btn">← Return to HireSync Job Board</a>
    </div>
  </div>

  <script>
    function handleSubmit(e) {
      e.preventDefault();
      const name = document.getElementById('fullName').value.trim();
      const email = document.getElementById('email').value.trim();
      
      document.getElementById('applicationView').style.display = 'none';
      document.getElementById('confirmText').innerHTML = 
        'Thank you, <strong>' + (name || 'Applicant') + '</strong>! Your application for <strong>${esc(job.title)}</strong> at <strong>${esc(job.company || 'our team')}</strong> has been received.<br><br>A confirmation notice was dispatched to <strong>' + email + '</strong>.';
      document.getElementById('confirmationView').style.display = 'block';
    }
  </script>
</body>
</html>`);
});

module.exports = router;
