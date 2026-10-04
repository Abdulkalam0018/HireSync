/**
 * GET /api/jobs - list job postings with pagination and filters.
 *
 * Query parameters (all optional):
 *   page     1-based page number                (default 1)
 *   limit    items per page, max 100            (default 20)
 *   company  exact company name, case-insensitive  e.g. ?company=acme%20ai
 *   from     postedDate >= this date (ISO)      e.g. ?from=2026-10-01
 *   to       postedDate <= this date (ISO)      e.g. ?to=2026-10-04 (whole day included)
 *
 * Response:
 *   { data: [...jobs], pagination: { page, limit, total, totalPages, hasNextPage } }
 *
 * DESIGN NOTES
 *  - Validate input and return 400 on garbage: never pass raw query strings
 *    into the DB layer, and never let `limit=1000000` dump the whole table.
 *  - Results are sorted newest-first by postedDate (uses the postedDate DESC
 *    index); jobs without a date go last; `id` is a tie-breaker so paging is
 *    stable (no job shown twice or skipped between pages).
 *  - count + findMany run inside one $transaction, so `total` and `data` come
 *    from the same consistent snapshot.
 *  - Offset pagination (skip/take) is simple and fine for thousands of rows.
 *    At millions of rows, deep pages get slow because the DB still walks the
 *    skipped rows; the fix is cursor pagination (WHERE id < lastSeenId).
 *  - Case-insensitive matching compiles to ILIKE, which can't use a plain
 *    B-tree index. Fine at our scale; at scale use the `citext` column type
 *    or store a lower-cased company column with its own index.
 */
const prisma = require('../lib/prisma');
const { HttpError } = require('../middleware/errorHandler');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePositiveInt(value, name, fallback) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new HttpError(400, `"${name}" must be a positive integer`);
  }
  return n;
}

function parseDate(value, name, { endOfDay = false } = {}) {
  if (value === undefined || value === '') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `"${name}" must be a valid date, e.g. 2026-10-01`);
  }
  // "to=2026-10-04" should include the whole of Oct 4, not stop at midnight.
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

async function listJobs(req, res) {
  const page = parsePositiveInt(req.query.page, 'page', 1);
  const limit = Math.min(parsePositiveInt(req.query.limit, 'limit', DEFAULT_LIMIT), MAX_LIMIT);
  const company = typeof req.query.company === 'string' ? req.query.company.trim() : '';
  const from = parseDate(req.query.from, 'from');
  const to = parseDate(req.query.to, 'to', { endOfDay: true });

  if (from && to && from > to) {
    throw new HttpError(400, '"from" must be earlier than "to"');
  }

  // Build the WHERE clause only from filters that were provided.
  const where = {};
  if (company) {
    where.company = { equals: company, mode: 'insensitive' };
  }
  if (from || to) {
    where.postedDate = { ...(from && { gte: from }), ...(to && { lte: to }) };
  }

  const [total, jobs] = await prisma.$transaction([
    prisma.jobPosting.count({ where }),
    prisma.jobPosting.findMany({
      where,
      orderBy: [{ postedDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const totalPages = Math.ceil(total / limit);
  res.json({
    data: jobs,
    pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
  });
}

module.exports = { listJobs };
