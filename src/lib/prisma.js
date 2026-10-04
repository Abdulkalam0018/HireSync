/**
 * Prisma client singleton.
 *
 * WHY A SINGLETON: Each `new PrismaClient()` opens its own pool of database
 * connections. If every module created one, we'd quickly exhaust the
 * database's connection limit (free Neon/Supabase tiers are small).
 * Node caches `require()` results, so exporting one instance means the whole
 * app shares a single connection pool.
 */
const { PrismaClient } = require('@prisma/client');
const config = require('../config');

const prisma = new PrismaClient({
  // Log slow/failed queries in development; only errors in production.
  log: config.env === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;
