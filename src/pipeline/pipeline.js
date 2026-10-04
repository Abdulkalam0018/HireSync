/**
 * Pipeline runner: scrape -> ingest, with a concurrency guard and run status.
 *
 * Both entry points use this module:
 *   - the cron scheduler (every 12h)
 *   - POST /api/scrape/trigger (manual)
 *
 * CONCURRENCY GUARD
 *   If someone hits "trigger" while the cron job is mid-scrape, we must not
 *   start a second scrape: it doubles the load on the target site and races
 *   on the same rows. A simple in-process lock (`currentRun`) rejects the
 *   second request; the API turns that into HTTP 409 Conflict.
 *
 *   Scaling note (good interview follow-up): this lock lives in memory, so it
 *   only protects ONE server process. With several replicas you'd move the lock
 *   to shared storage, e.g. a Redis `SET key value NX PX ttl` lock or a
 *   "scrape_runs" table with a unique "running" row. The DB unique constraint
 *   still prevents duplicate jobs even without the lock.
 *
 * SAFETY RULE
 *   We never DELETE jobs just because they were missing from a scrape. If the
 *   site was down and we scraped 0 jobs, a "delete what we didn't see" rule
 *   would wipe the database. Instead, `scrapedAt` tells us when each job was
 *   last seen; stale jobs can be hidden by a query, not destroyed.
 */
const crypto = require('node:crypto');
const logger = require('../lib/logger');
const { scrapeJobBoard } = require('../scraper/scraper.service');
const { ingestJobs } = require('../ingestion/jobIngestion.service');

let currentRun = null; // { summary, promise } while a run is in progress
let lastRun = null; // summary of the most recent finished run

/**
 * Does the actual work. NEVER throws: every failure is captured in the
 * summary, so callers (cron, HTTP) can't crash the process with an
 * unhandled rejection.
 */
async function execute(summary) {
  const log = logger.child({ runId: summary.runId, trigger: summary.trigger });
  const runTimestamp = new Date(summary.startedAt);
  log.info('Pipeline started');

  try {
    const { jobs, stats } = await scrapeJobBoard({ log });
    summary.scrape = stats;

    const ingestion = jobs.length
      ? await ingestJobs(jobs, { runTimestamp, log })
      : { received: 0, created: 0, updated: 0, failed: 0, errors: [] };
    summary.ingestion = ingestion;

    // success: everything worked | partial: got data but some pages/rows failed
    // failed: nothing usable was scraped
    if (jobs.length === 0) summary.status = 'failed';
    else if (stats.pagesFailed > 0 || ingestion.failed > 0) summary.status = 'partial';
    else summary.status = 'success';
  } catch (err) {
    // Unexpected error (e.g. database unreachable). Record it, don't rethrow.
    summary.status = 'failed';
    summary.error = err.message;
    log.error('Pipeline crashed', { err });
  }

  summary.finishedAt = new Date().toISOString();
  summary.durationMs = Date.parse(summary.finishedAt) - Date.parse(summary.startedAt);
  log.info('Pipeline finished', { status: summary.status, durationMs: summary.durationMs });
  return summary;
}

/**
 * Start a pipeline run unless one is already running.
 *
 * @param {'cron'|'manual'} trigger who started it (for logs/status)
 * @returns {{ accepted: boolean, run: object, promise?: Promise<object> }}
 */
function triggerPipeline(trigger) {
  if (currentRun) {
    return { accepted: false, run: currentRun.summary };
  }

  const summary = {
    runId: crypto.randomUUID(),
    trigger,
    status: 'running',
    startedAt: new Date().toISOString(),
  };

  const promise = execute(summary).finally(() => {
    lastRun = summary;
    currentRun = null; // release the lock no matter what
  });

  currentRun = { summary, promise };
  return { accepted: true, run: summary, promise };
}

/** Snapshot for GET /api/scrape/status. */
function getPipelineStatus() {
  return {
    isRunning: Boolean(currentRun),
    currentRun: currentRun?.summary ?? null,
    lastRun,
  };
}

/** Used during graceful shutdown: wait for an in-flight run to finish. */
function waitForCurrentRun() {
  return currentRun ? currentRun.promise : Promise.resolve(null);
}

module.exports = { triggerPipeline, getPipelineStatus, waitForCurrentRun };
