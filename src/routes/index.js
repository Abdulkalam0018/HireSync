/**
 * API routes - the "table of contents" of the HTTP interface.
 *
 * Layering (request flow):
 *   route (URL + middleware) -> controller (HTTP in/out, validation)
 *     -> service (business logic: scraper / ingestion / pipeline) -> Prisma -> PostgreSQL
 *
 * Controllers never contain scraping logic and services never touch `req`/`res`.
 * That separation is why the same pipeline can be run by HTTP AND by cron.
 */
const { Router } = require('express');
const { listJobs } = require('../controllers/jobs.controller');
const { triggerScrape, getScrapeStatus } = require('../controllers/scrape.controller');
const { requireApiKey } = require('../middleware/requireApiKey');

const router = Router();

// Public read endpoint
router.get('/jobs', listJobs);

// Scraper control (trigger is protected: it makes us send traffic to another site)
router.post('/scrape/trigger', requireApiKey, triggerScrape);
router.get('/scrape/status', getScrapeStatus);

module.exports = router;
