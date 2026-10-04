# HireSync: Tech Internship Aggregator Pipeline

A lightweight, production-grade web scraping and ingestion pipeline built with **Node.js, Express, PostgreSQL, Prisma ORM, Axios, Cheerio, and node-cron**.

Designed specifically for internship applications and system design interviews, demonstrating how to build an ETL (Extract, Transform, Load) pipeline that is resilient to network failures and guarantees zero duplicate data.

---

## Architecture Overview

```
                                      +--------------------------+
                                      |   node-cron (12h tick)   |
                                      +-------------+------------+
                                                    |
   +-----------------------+                        |
   | POST /scrape/trigger  +------------------->----+
   +-----------------------+                        |
                                                    v
                                      +-------------+------------+
                                      |  In-Memory Lock Guard    |
                                      |  (Prevents Overlap)      |
                                      +-------------+------------+
                                                    |
                                                    v
[ Extract ]                           +-------------+------------+
Axios + Cheerio                       |  Scraping Service        |
- Exponential backoff + jitter        |  - Fetches HTML pages    |
- Random politeness delay (1.5-4s)    |  - Fallback CSS selector |
- Circuit breaker on failures         |  - URL-hash ID fallback  |
                                      +-------------+------------+
                                                    |
                                                    v
[ Transform & Deduplicate ]           +-------------+------------+
- In-memory deduplication (Map)       |  Ingestion Service       |
- Clean text & parse dates            |  - Batched Concurrency   |
                                      +-------------+------------+
                                                    |
                                                    v
[ Load ]                              +-------------+------------+
PostgreSQL + Prisma                   |  Prisma UPSERT           |
- Atomic ON CONFLICT DO UPDATE        |  - Updates scrapedAt     |
- Indexed by date and company         |  - Preserves createdAt   |
                                      +-------------+------------+
                                                    |
                                                    v
[ Serve ]                             +-------------+------------+
Express REST API                      |  GET /api/jobs           |
- Pagination (limit, page)            |  - Query by company/date |
- Filter by company & date range      +--------------------------+
```

---

## Key System Design Interview Concepts

### 1. How It Handles Duplicate Data (3-Layer Defense)

Duplicate data is the #1 challenge in web scraping pipelines because scrapers run periodically over overlapping datasets. HireSync handles deduplication at three distinct layers:

1. **Layer 1: In-Run Memory Deduplication (`Map`)**
   - Job boards frequently pin "Featured" postings to the top of every single paginated page.
   - The scraper tracks `jobsById = new Map()` keyed by `externalJobId`. If a job appears on page 1 and again on page 2, the newer object overwrites the map entry without making redundant database calls.

2. **Layer 2: Atomic Database Upsert (`INSERT ... ON CONFLICT DO UPDATE`)**
   - Naive approach: `findUnique` followed by `create` has a race condition (Time-of-Check to Time-of-Use, or TOCTOU).
   - HireSync uses Prisma's `upsert` on the unique column `externalJobId`. PostgreSQL executes this in a single atomic statement:
     ```sql
     INSERT INTO job_postings ("externalJobId", "title", "company", ...)
     VALUES ($1, $2, $3, ...)
     ON CONFLICT ("externalJobId")
     DO UPDATE SET "title" = $2, "scrapedAt" = CURRENT_TIMESTAMP;
     ```
   - If a job was already ingested yesterday, its metadata is updated and `scrapedAt` is refreshed to prove the posting is still active. Its original `createdAt` and `postedDate` remain untouched.

3. **Layer 3: Stable Identity Resolution Fallback**
   - Some job boards omit explicit `id` attributes. HireSync resolves IDs using a priority chain:
     1. Element attribute (e.g. `data-job-id="1001"`).
     2. URL route pattern (e.g. `/jobs/1001` -> `1001`).
     3. Fallback SHA-256 hash of the canonical apply URL: `h_<sha256(url)[0:16]>`.
   - **Why hash the URL instead of the title?** Job titles change frequently ("Intern" -> "Software Intern"), which would result in false duplicate rows. Canonical URLs rarely change.

---

### 2. How It Handles Network Failures

1. **Transient vs. Permanent Error Classification**
   - **Transient Errors (Retried):** HTTP 500, 502, 503, 504, 408, 429 (Too Many Requests), and socket dropouts (`ECONNRESET`, `ETIMEDOUT`, `ECONNABORTED`).
   - **Permanent Errors (Never Retried):** HTTP 404 (Not Found), 403 (Forbidden), 401 (Unauthorized). Retrying these wastes resources and irritates remote firewalls.

2. **Exponential Backoff with Full Jitter**
   - Delays double each failure ($1s, 2s, 4s...$) up to a maximum cap.
   - Jitter ($t = \text{random}(0, \text{backoff})$) prevents the **Thundering Herd problem**, where thousands of retry clients hammer a recovering server in synchronized waves.
   - Respects HTTP `Retry-After` header when throttled by HTTP 429.

3. **Politeness Delays**
   - Random wait of 1.5s to 4.0s between sequential page requests to avoid triggering Web Application Firewall (WAF) rate limits.

4. **Circuit Breaker**
   - If 2 consecutive page fetches fail completely after exhausting all retries, the scraper stops immediately rather than crawling dozens of broken pages.

5. **Concurrency Rate Limiting on Database Ingestion**
   - Ingestion is executed in chunks of 10 concurrent upserts (`Promise.allSettled`). This prevents saturating the PostgreSQL connection pool while still executing much faster than sequential operations.

---

## Step-by-Step Project Setup

### 1. Prerequisites
- Node.js >= 20.12.0
- A PostgreSQL database (e.g., free tier on [Neon.tech](https://neon.tech) or [Supabase](https://supabase.com)).

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update `DATABASE_URL` with your connection string:
```env
DATABASE_URL="postgresql://user:password@ep-xyz.neon.tech/hiresync?sslmode=require"
PORT=3000
```

### 3. Database Migration & Prisma Generation
Generate the Prisma Client and apply migrations:
```bash
npm run db:generate
npm run db:migrate
```

### 4. Running the Application
```bash
# Start server with watch mode:
npm run dev

# Or start in production mode:
npm start

# Run unit tests (19 tests covering parsing, dates, retries):
npm test
```

---

## API Endpoints

### 1. `GET /api/jobs`
Retrieve paginated job postings with optional filters.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | Integer | `1` | Page number |
| `limit` | Integer | `20` | Items per page (max 100) |
| `company` | String | - | Case-insensitive company filter |
| `from` | ISO Date | - | Filter postings on or after date (`YYYY-MM-DD`) |
| `to` | ISO Date | - | Filter postings on or before date (`YYYY-MM-DD`) |

**Example Request:**
```bash
curl "http://localhost:3000/api/jobs?company=Acme&limit=10"
```

**Example Response:**
```json
{
  "data": [
    {
      "id": 1,
      "externalJobId": "mockyc:1001",
      "title": "Backend Engineering Intern",
      "company": "Acme AI",
      "location": "San Francisco, CA",
      "applyUrl": "http://localhost:3000/mock-board/jobs/1001",
      "postedDate": "2026-10-03T09:03:20.886Z",
      "scrapedAt": "2026-10-04T09:03:20.886Z",
      "createdAt": "2026-10-04T09:03:20.886Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1,
    "hasNextPage": false
  }
}
```

---

### 2. `POST /api/scrape/trigger`
Trigger the scraping pipeline manually.

**Headers:**
- `x-api-key: change-me` (Required if `SCRAPE_API_KEY` is configured in `.env`)

**Query Parameters:**
- `wait=true` (Optional): Holds HTTP connection open until the scrape completes and returns full summary.

**Responses:**
- `202 Accepted`: Scrape scheduled and running in background. Returns `runId` and link to status.
- `409 Conflict`: Returned if another scrape is already in progress.

**Example Request:**
```bash
curl -X POST "http://localhost:3000/api/scrape/trigger?wait=true" \
  -H "x-api-key: change-me"
```

---

### 3. `GET /api/scrape/status`
Check if a scrape is currently running and inspect the results of the most recent execution.

---

### 4. `GET /health`
Liveness and database connectivity probe for monitoring systems.

---

## Running the Standalone Scraper CLI
To run a scrape directly from your command line without starting Express:
```bash
npm run scrape
```

---

## Project Structure

```
HireSync/
├── prisma/
│   ├── schema.prisma                  # PostgreSQL schema with indexes
│   └── migrations/                    # Versioned SQL migrations
├── src/
│   ├── app.js                         # Express factory (middleware, routes)
│   ├── server.js                      # HTTP server & graceful shutdown
│   ├── config/                        # Fail-fast environment configuration
│   ├── controllers/                   # Route request/response handlers
│   ├── ingestion/
│   │   └── jobIngestion.service.js    # Concurrency-limited atomic upsert
│   ├── lib/
│   │   ├── logger.js                  # Zero-dependency structured JSON logger
│   │   └── prisma.js                  # Shared PrismaClient singleton
│   ├── middleware/                    # Error handling and timing-safe auth
│   ├── mock-board/                    # Local mock job board for offline testing
│   ├── pipeline/                      # In-process lock and pipeline orchestrator
│   ├── routes/                        # Route definitions
│   ├── scheduler/
│   │   └── cron.js                    # node-cron scheduler (every 12 hours)
│   ├── scraper/
│   │   ├── dateParser.js              # Relative and ISO date parsing
│   │   ├── httpClient.js              # Resilient Axios client
│   │   ├── parser.js                  # Cheerio parser with fallback selectors
│   │   ├── scraper.service.js         # Crawling loop with circuit breaker
│   │   └── selectors.js               # Priority CSS selector configuration
│   ├── scripts/
│   │   └── runOnce.js                 # Standalone CLI scrape runner
│   └── utils/
│       ├── delay.js                   # Politeness delays
│       └── retry.js                   # Exponential backoff with full jitter
└── tests/                             # Node.js native unit tests
```

---

## License
MIT
