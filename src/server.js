/**
 * Entry point: start HTTP server + scheduler, and shut down GRACEFULLY.
 *
 * GRACEFUL SHUTDOWN - why it matters:
 *   Deploys and restarts send the process SIGTERM. If we exited instantly we
 *   might kill a scrape halfway through its upserts or drop in-flight HTTP
 *   requests. Instead we:
 *     1. stop the cron job        (no NEW scheduled runs)
 *     2. stop accepting requests  (server.close lets in-flight ones finish)
 *     3. wait for a running scrape to finish (with a timeout)
 *     4. close DB connections     (prisma.$disconnect)
 *     5. exit
 *   Even if a scrape IS cut off, nothing is corrupted: each upsert is atomic
 *   and idempotent, so the next run simply fills in the rest.
 */
const config = require('./config');
const logger = require('./lib/logger');
const prisma = require('./lib/prisma');
const { createApp } = require('./app');
const { startScheduler } = require('./scheduler/cron');
const { waitForCurrentRun } = require('./pipeline/pipeline');

const SHUTDOWN_TIMEOUT_MS = 30_000;

async function main() {
  // Fail fast if the database is unreachable instead of erroring on first request.
  await prisma.$connect();
  logger.info('Connected to PostgreSQL');

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info('HTTP server listening', { port: config.port, env: config.env });
  });

  const cronTask = startScheduler();

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutdown signal received', { signal });

    // Hard deadline so a stuck scrape can't block the deploy forever.
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      await cronTask?.stop();
      await new Promise((resolve) => server.close(resolve));
      await waitForCurrentRun();
      await prisma.$disconnect();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', { err });
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM')); // sent by Docker/Kubernetes/Heroku
  process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
}

// Last-resort safety nets: log loudly so bugs are visible, not silent.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { err: reason instanceof Error ? reason : new Error(String(reason)) });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception - exiting', { err });
  process.exit(1); // state may be corrupt; let the process manager restart us
});

main().catch((err) => {
  logger.error('Failed to start server', { err });
  process.exit(1);
});
