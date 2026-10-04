/**
 * Scheduler: run the pipeline automatically every 12 hours (node-cron).
 *
 * Cron expression "0 *\/12 * * *" (written without the backslash), field by field:
 *   ┌──────── minute        0      -> at minute 0
 *   │ ┌────── hour          *\/12  -> every 12th hour (00:00, 12:00)
 *   │ │ ┌──── day of month  *      -> every day
 *   │ │ │ ┌── month         *      -> every month
 *   │ │ │ │ ┌ day of week   *      -> any weekday
 *   0 *\/12 * * *
 *
 * - `timezone` makes "00:00" mean midnight in Asia/Kolkata, not the server's
 *   timezone (cloud servers usually run in UTC).
 * - `noOverlap: true` tells node-cron not to start a tick while the previous
 *   one is still running. Our pipeline lock ALSO guards against overlap with
 *   manual API triggers, which node-cron can't know about.
 *
 * Trade-off worth mentioning in an interview: an in-process scheduler runs on
 * EVERY replica. With 3 servers you'd scrape 3 times. Options at scale: run the
 * scheduler on one dedicated worker, use a distributed lock, or move scheduling
 * to the platform (Kubernetes CronJob, AWS EventBridge, GitHub Actions cron)
 * calling POST /api/scrape/trigger.
 */
const cron = require('node-cron');
const config = require('../config');
const logger = require('../lib/logger');
const { triggerPipeline } = require('../pipeline/pipeline');

/**
 * Start the cron job. Returns the node-cron task (so server.js can stop it on
 * shutdown) or null when scheduling is disabled.
 */
function startScheduler() {
  const { schedule, timezone, enabled } = config.cron;

  if (!enabled) {
    logger.info('Scheduler disabled (CRON_ENABLED=false)');
    return null;
  }

  if (!cron.validate(schedule)) {
    throw new Error(`Invalid CRON_SCHEDULE expression: "${schedule}"`);
  }

  const task = cron.schedule(
    schedule,
    async () => {
      const { accepted, run, promise } = triggerPipeline('cron');
      if (!accepted) {
        logger.warn('Scheduled scrape skipped: a run is already in progress', {
          runId: run.runId,
        });
        return;
      }
      await promise; // keep the tick "busy" until done (works with noOverlap)
    },
    { timezone, name: 'scrape-job-board', noOverlap: true }
  );

  logger.info('Scheduler started', {
    schedule,
    timezone,
    nextRun: task.getNextRun()?.toISOString() ?? null,
  });
  return task;
}

module.exports = { startScheduler };
