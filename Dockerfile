# ==============================================================================
# Production Dockerfile for HireSync
#
# Key Features:
#   - Lightweight Node 20 Debian slim image
#   - OpenSSL included (required by Prisma's native query engine)
#   - Non-root user (node) for container security hardening
#   - Healthcheck targeting GET /health
# ==============================================================================

FROM node:20-slim AS base

# Install openssl and ca-certificates (needed by Prisma client on Debian/Ubuntu)
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests first to leverage Docker layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies and generate Prisma Client
RUN npm ci --omit=dev --ignore-scripts && \
    npx prisma generate

# Copy application source code
COPY src ./src

# Set production environment variables
ENV NODE_ENV=production \
    PORT=3000

# Security: switch to the unprivileged built-in 'node' user
USER node

# Expose HTTP port
EXPOSE 3000

# Container healthcheck: pings /health every 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "src/server.js"]
