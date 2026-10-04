/**
 * Centralised configuration.
 *
 * WHY: Reading `process.env` all over the codebase makes it hard to know what
 * the app needs to run. Instead, every setting is read, validated and given a
 * default HERE, once, at startup. If something essential is missing we crash
 * immediately ("fail fast") instead of failing mysteriously at 3am mid-scrape.
 */

// Load variables from .env into process.env (built into Node >= 20.12,
// so we don't need the `dotenv` package). In production the platform usually
// injects env vars directly, so a missing .env file is not an error.
try {
  process.loadEnvFile();
} catch {
  /* no .env file - rely on real environment variables */
}

/** Parse an integer env var, falling back to a default. */
function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`Config error: ${name} must be an integer, got "${raw}"`);
  }
  return value;
}

/** Parse a float env var, falling back to a default. */
function float(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseFloat(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Config error: ${name} must be a number, got "${raw}"`);
  }
  return value;
}

/** Parse a boolean env var ("true"/"false"). */
function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw.toLowerCase() === 'true';
}

const port = int('PORT', 3000);

const config = {
  env: process.env.NODE_ENV || 'development',
  port,

  databaseUrl: process.env.DATABASE_URL,

  scraper: {
    baseUrl: process.env.SCRAPE_BASE_URL || `http://localhost:${port}/mock-board/jobs`,
    sourceName: process.env.SCRAPE_SOURCE_NAME || 'mockyc',
    maxPages: int('SCRAPE_MAX_PAGES', 10),
    minDelayMs: int('SCRAPE_MIN_DELAY_MS', 1500),
    maxDelayMs: int('SCRAPE_MAX_DELAY_MS', 4000),
    timeoutMs: int('SCRAPE_TIMEOUT_MS', 10000),
    maxRetries: int('SCRAPE_MAX_RETRIES', 3),
    // Stop paginating after this many pages fail in a row (site is probably down).
    maxConsecutiveFailures: int('SCRAPE_MAX_CONSECUTIVE_FAILURES', 2),
    // Identify ourselves honestly. Good scraping etiquette.
    userAgent:
      process.env.SCRAPE_USER_AGENT ||
      'HireSyncBot/1.0 (+https://github.com/Abdulkalam0018/HireSync)',
  },

  cron: {
    schedule: process.env.CRON_SCHEDULE || '0 */12 * * *',
    timezone: process.env.CRON_TIMEZONE || 'Asia/Kolkata',
    enabled: bool('CRON_ENABLED', true),
  },

  security: {
    scrapeApiKey: process.env.SCRAPE_API_KEY || '',
  },

  mockBoard: {
    enabled: bool('ENABLE_MOCK_BOARD', true),
    failRate: float('MOCK_FAIL_RATE', 0),
  },
};

// ---- Fail-fast validation ----------------------------------------------
if (!config.databaseUrl) {
  throw new Error('Config error: DATABASE_URL is required. Copy .env.example to .env and set it.');
}
if (config.scraper.minDelayMs > config.scraper.maxDelayMs) {
  throw new Error('Config error: SCRAPE_MIN_DELAY_MS must be <= SCRAPE_MAX_DELAY_MS');
}

module.exports = config;
