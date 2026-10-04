/**
 * Data ingestion: write scraped jobs to PostgreSQL WITHOUT creating duplicates.
 *
 * ========================== HOW DUPLICATES ARE HANDLED ==========================
 *
 * Problem: the scraper runs every 12h and sees mostly the SAME jobs each time.
 * A naive INSERT would add a new copy of every job on every run.
 *
 * Solution: UPSERT ("update or insert") keyed on `externalJobId`, which has a
 * UNIQUE constraint in the schema.
 *
 *   prisma.jobPosting.upsert({ where: { externalJobId }, create: {...}, update: {...} })
 *
 * Because our `where` targets a single unique column, Prisma compiles this to
 * ONE native PostgreSQL statement:
 *
 *   INSERT INTO job_postings (...) VALUES (...)
 *   ON CONFLICT ("externalJobId") DO UPDATE SET title = ..., "scrapedAt" = ...
 *
 * That is ATOMIC: there is no gap between "check if it exists" and "insert" in
 * which a concurrent writer could sneak in a duplicate. (The naive
 * `findUnique` then `create` approach has exactly that race condition.)
 *
 * Three layers of defence overall:
 *   1. In-memory Map in the scraper  -> no duplicates within one run.
 *   2. Upsert on externalJobId       -> no duplicates across runs.
 *   3. UNIQUE index in PostgreSQL    -> the database itself rejects duplicates,
 *                                       even if application code has a bug.
 *
 * What gets updated on a repeat sighting?
 *   - title / company / location / applyUrl -> refreshed (the posting may be edited)
 *   - scrapedAt -> set to now ("last seen"), useful to detect expired jobs
 *   - createdAt -> NEVER touched ("first seen")
 *   - postedDate -> NEVER touched after insert. Relative dates like "3 days ago"
 *     are approximate; re-parsing them each run would make the date drift.
 *
 * Why not other approaches?
 *   - createMany({ skipDuplicates: true }): fast, but SKIPS existing rows, so
 *     edited titles/locations would never be refreshed.
 *   - One giant transaction: a single bad row would roll back ALL jobs. Each
 *     upsert is already atomic on its own, so we prefer partial success.
 * ================================================================================
 */
const prisma = require('../lib/prisma');
const defaultLogger = require('../lib/logger');
const { withRetry } = require('../utils/retry');

// How many upserts run in parallel. Bounded so we don't exhaust the Prisma
// connection pool (default ~ num_cpus * 2 + 1 connections).
const CONCURRENCY = 10;

/** Split an array into chunks of `size`. */
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

/**
 * Upsert ONE job. `runTimestamp` is shared by every job in the same run.
 */
function upsertJob(job, runTimestamp) {
  return withRetry(
    () =>
      prisma.jobPosting.upsert({
        where: { externalJobId: job.externalJobId },
        create: {
          externalJobId: job.externalJobId,
          title: job.title,
          company: job.company,
          location: job.location,
          applyUrl: job.applyUrl,
          postedDate: job.postedDate,
          scrapedAt: runTimestamp,
          createdAt: runTimestamp,
        },
        update: {
          title: job.title,
          company: job.company,
          location: job.location,
          applyUrl: job.applyUrl,
          scrapedAt: runTimestamp,
        },
        select: { id: true, createdAt: true },
      }),
    {
      // P2002 = unique constraint violation. Can only happen in a rare race
      // where another process inserted the same job a moment ago. Retrying
      // once turns it into a normal UPDATE.
      maxRetries: 1,
      baseDelayMs: 50,
      shouldRetry: (err) => err?.code === 'P2002',
    }
  );
}

/**
 * Ingest a batch of scraped jobs.
 *
 * @param {object[]} jobs
 * @param {object} [options]
 * @param {Date}   [options.runTimestamp] timestamp for this run (defaults to now)
 * @param {object} [options.log]
 * @returns {Promise<{ received:number, created:number, updated:number, failed:number, errors:object[] }>}
 */
async function ingestJobs(jobs, { runTimestamp = new Date(), log = defaultLogger } = {}) {
  const result = { received: jobs.length, created: 0, updated: 0, failed: 0, errors: [] };

  for (const batch of chunk(jobs, CONCURRENCY)) {
    // allSettled (not all): one failing row must not abort the rest.
    const outcomes = await Promise.allSettled(batch.map((job) => upsertJob(job, runTimestamp)));

    outcomes.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') {
        // Trick to tell inserts from updates without an extra query:
        // on INSERT we set createdAt = runTimestamp; on UPDATE createdAt keeps
        // its older value from a previous run.
        const wasCreated = outcome.value.createdAt.getTime() === runTimestamp.getTime();
        if (wasCreated) result.created++;
        else result.updated++;
      } else {
        result.failed++;
        const err = outcome.reason;
        if (result.errors.length < 20) {
          result.errors.push({ externalJobId: batch[i].externalJobId, message: err.message });
        }
        log.error('Failed to upsert job', { externalJobId: batch[i].externalJobId, err });
      }
    });
  }

  log.info('Ingestion complete', {
    received: result.received,
    created: result.created,
    updated: result.updated,
    failed: result.failed,
  });
  return result;
}

module.exports = { ingestJobs };
