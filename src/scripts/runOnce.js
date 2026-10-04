/**
 * Standalone CLI runner for the scraping & ingestion pipeline.
 *
 * Usage:
 *   npm run scrape
 *
 * Useful for:
 *   - Running the scraper on-demand from the terminal without starting the Express server.
 *   - Calling via external schedulers (e.g. AWS EventBridge, Kubernetes CronJob, Linux crontab).
 *   - Debugging scraping and ingestion end-to-end locally.
 */
const prisma = require('../lib/prisma');
const logger = require('../lib/logger');
const { triggerPipeline } = require('../pipeline/pipeline');

async function run() {
  logger.info('Starting manual scrape from CLI...');

  try {
    await prisma.$connect();
    const { accepted, promise } = triggerPipeline('cli');

    if (!accepted) {
      logger.warn('A scrape run is already in progress.');
      process.exit(1);
    }

    const summary = await promise;
    logger.info('CLI Scrape finished successfully', { summary });
    await prisma.$disconnect();
    process.exit(summary.status === 'failed' ? 1 : 0);
  } catch (err) {
    logger.error('Fatal CLI execution error', { err });
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

run();
