/**
 * Express application factory.
 *
 * `app.js` BUILDS the app (middleware + routes); `server.js` RUNS it
 * (listen, cron, shutdown). Keeping them apart lets tests import the app
 * without opening a port or starting the scheduler.
 *
 * Middleware order matters - a request flows top to bottom:
 *   JSON parser -> request logger -> routes -> 404 handler -> error handler
 */
const path = require('node:path');
const express = require('express');
const config = require('./config');
const logger = require('./lib/logger');
const prisma = require('./lib/prisma');
const apiRouter = require('./routes');
const mockBoardRouter = require('./mock-board/router');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.disable('x-powered-by'); // don't advertise our stack to attackers
  app.use(express.json({ limit: '100kb' })); // cap body size

  // Request logging: method, path, status and latency for every request.
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info('HTTP request', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      });
    });
    next();
  });

  // Serve static UI assets from src/public
  app.use(express.static(path.join(__dirname, 'public')));

  // Root endpoint: HTML dashboard for browsers, JSON for API clients
  app.get('/', (req, res) => {
    if (req.accepts('html')) {
      return res.sendFile(path.join(__dirname, 'public/index.html'));
    }
    res.json({
      name: 'HireSync API',
      description: 'Tech Internship Aggregator Pipeline',
      status: 'online',
      endpoints: {
        health: '/health',
        jobs: '/api/jobs',
        scrapeStatus: '/api/scrape/status',
        triggerScrape: 'POST /api/scrape/trigger',
        ...(config.mockBoard.enabled && { mockBoard: '/mock-board/jobs' }),
      },
      documentation: 'https://github.com/Abdulkalam0018/HireSync',
    });
  });

  // Dedicated JSON API directory
  app.get('/api', (req, res) => {
    res.json({
      name: 'HireSync API',
      description: 'Tech Internship Aggregator Pipeline',
      endpoints: {
        health: '/health',
        jobs: '/api/jobs',
        scrapeStatus: '/api/scrape/status',
        triggerScrape: 'POST /api/scrape/trigger',
      },
    });
  });

  // Health check for load balancers / uptime monitors. Also pings the DB, so
  // "healthy" means "can actually serve data", not just "process is alive".
  app.get('/health', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'up', uptimeSec: Math.round(process.uptime()) });
    } catch (err) {
      logger.error('Health check failed', { err });
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  if (config.mockBoard.enabled) {
    app.use('/mock-board', mockBoardRouter);
  }

  app.use('/api', apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
