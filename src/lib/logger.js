/**
 * Minimal structured logger.
 *
 * WHY: `console.log("something broke")` is impossible to search in production.
 * We emit one JSON object per line (timestamp, level, message, context) so
 * log tools (CloudWatch, Datadog, `grep | jq`) can filter e.g. all
 * `level=error` lines for `runId=abc`.
 *
 * In a bigger project you'd use `pino` or `winston`; this keeps zero deps.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[process.env.LOG_LEVEL] || LEVELS.info;

function log(level, message, context = {}) {
  if (LEVELS[level] < minLevel) return;

  // Error objects don't serialise to JSON nicely - pull out the useful bits.
  if (context.err instanceof Error) {
    context = { ...context, err: { message: context.err.message, code: context.err.code } };
  }

  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...context,
  });

  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

const logger = {
  debug: (msg, ctx) => log('debug', msg, ctx),
  info: (msg, ctx) => log('info', msg, ctx),
  warn: (msg, ctx) => log('warn', msg, ctx),
  error: (msg, ctx) => log('error', msg, ctx),
  /** Returns a logger that automatically attaches `bindings` to every line. */
  child(bindings) {
    return {
      debug: (msg, ctx) => log('debug', msg, { ...bindings, ...ctx }),
      info: (msg, ctx) => log('info', msg, { ...bindings, ...ctx }),
      warn: (msg, ctx) => log('warn', msg, { ...bindings, ...ctx }),
      error: (msg, ctx) => log('error', msg, { ...bindings, ...ctx }),
    };
  },
};

module.exports = logger;
