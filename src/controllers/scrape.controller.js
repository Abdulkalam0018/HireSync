/**
 * POST /api/scrape/trigger - start a scrape manually.
 * GET  /api/scrape/status  - see whether a scrape is running + last result.
 *
 * WHY 202 ACCEPTED (asynchronous) BY DEFAULT?
 *   A scrape takes seconds to minutes (random delays + retries). Holding an
 *   HTTP request open that long risks client/load-balancer timeouts
 *   (many proxies cut requests at 30-60s). So we start the job, immediately
 *   return 202 + a runId, and the client polls /api/scrape/status.
 *
 *   `?wait=true` keeps the request open until the run finishes - handy for
 *   demos and scripts, not recommended for production clients.
 *
 * WHY 409 CONFLICT?
 *   If a run is already in progress we refuse to start another one (see the
 *   lock in pipeline.js). 409 tells the client "valid request, but it
 *   conflicts with the current state of the server".
 */
const { triggerPipeline, getPipelineStatus } = require('../pipeline/pipeline');

async function triggerScrape(req, res) {
  const { accepted, run, promise } = triggerPipeline('manual');

  if (!accepted) {
    return res.status(409).json({
      error: { message: 'A scrape is already running. Try again when it finishes.' },
      currentRun: run,
    });
  }

  if (req.query.wait === 'true') {
    const finished = await promise;
    return res.status(200).json({ message: 'Scrape finished', run: finished });
  }

  res.status(202).json({
    message: 'Scrape started',
    run,
    statusUrl: '/api/scrape/status',
  });
}

function getScrapeStatus(req, res) {
  res.json(getPipelineStatus());
}

module.exports = { triggerScrape, getScrapeStatus };
