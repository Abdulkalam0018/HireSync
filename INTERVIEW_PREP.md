# HireSync: System Design & Interview Preparation Guide

This guide gives you word-for-word explanations and conceptual frameworks to present this project confidently in backend engineering internship interviews.

---

## 1. The 30-Second Elevator Pitch

> *"I built **HireSync**, an automated internship aggregation pipeline using Node.js, Express, PostgreSQL, Prisma, Axios, Cheerio, and node-cron.*
>
> *The core challenge with scraping pipelines is network flakiness, rate limiting, and duplicate data accumulation. To solve this, I designed a multi-layer ETL system featuring:*
> 1. *A resilient scraper with randomized politeness delays, fallback CSS selector chains, and exponential backoff with full jitter.*
> 2. *A three-tier deduplication engine utilizing in-memory maps, canonical URL hashing, and atomic PostgreSQL `ON CONFLICT DO UPDATE` upserts.*
> 3. *An Express REST API with indexed pagination, structured JSON logging, concurrency locking to prevent overlapping runs, and a 12-hour automated scheduler."*

---

## 2. High-Frequency Interview Questions & How to Answer

### Q1: "Why did you use Axios + Cheerio instead of Puppeteer or Playwright?"
**Answer:**
> *"I chose Axios and Cheerio for three reasons: resource efficiency, throughput, and operational complexity.*
>
> *Puppeteer and Playwright launch full headless Chromium instances. Each browser process consumes 100MB to 300MB of RAM and significant CPU to execute JavaScript and render CSS. In contrast, Cheerio is a lightweight HTML parser built on `htmlparser2`. It parses the static raw HTML string returned by Axios using a jQuery-like DOM model in single-digit milliseconds, consuming minimal RAM.*
>
> *Because startup job boards like Y Combinator jobs render their initial listings server-side (SSR), running a headless browser is unnecessary overhead. If a board requires client-side SPA rendering or infinite scroll, I would design a hybrid architecture: use Axios + Cheerio as the fast path, and fall back to a headless browser worker pool only for JS-heavy targets."*

---

### Q2: "How do you handle duplicate postings when the scraper runs every 12 hours?"
**Answer:**
> *"Duplicate management is handled across three distinct stages:*
>
> 1. ***Stable Identity (`externalJobId`):***
>    *If the site provides an ID attribute (like `data-job-id="1001"`), we use it. If not, we extract the numeric ID from the listing URL. As a final fallback, we generate a SHA-256 hash of the canonical apply URL.*
>    *Crucially, we do **not** hash the job title or description, because companies frequently tweak titles (e.g. from 'Intern' to 'Software Intern'). Hashing mutable text creates duplicate rows for the same position.*
>
> 2. ***In-Run Memory Map:***
>    *Job boards often pin 'Featured' postings at the top of every page. The scraper maintains an in-memory `Map<string, Job>` keyed by `externalJobId`. Repeated items within the same scrape run are deduplicated in memory before ever hitting the database.*
>
> 3. ***Atomic PostgreSQL Upsert (`ON CONFLICT`):***
>    *Rather than doing a 'check-then-insert' (`SELECT` followed by `INSERT`), which suffers from race conditions, we issue Prisma's `upsert`:*
>    ```sql
>    INSERT INTO job_postings (...) VALUES (...)
>    ON CONFLICT ("externalJobId")
>    DO UPDATE SET "title" = EXCLUDED.title, "scrapedAt" = CURRENT_TIMESTAMP;
>    ```
>    *This updates the metadata and refreshes `scrapedAt` to indicate the job is still active, while preserving `createdAt` and avoiding duplicate database records."*

---

### Q3: "What happens when the target website redesigns its HTML layout?"
**Answer:**
> *"Hardcoded CSS selectors are the most common single point of failure in web scrapers. I mitigated this with **Fallback Selector Chains**:*
>
> *In `src/scraper/selectors.js`, every field is mapped to an ordered array of selectors:*
> ```javascript
> title: ['.job-title', 'h3.title', '[data-field="title"]']
> ```
> *The parser attempts each selector in priority order. If an element isn't found with the primary selector, it moves to the fallback. In addition:*
> - *The scraper emits metrics on `fallbacksUsed`. An increase in this metric alerts us that the markup is drifting.*
> - *Per-card error isolation ensures that if one card's markup is malformed, that individual card is logged and skipped (`missing_title`), while the remaining jobs on the page are parsed successfully.*
> - *If an entire page yields cards but zero valid jobs, a high-priority warning is emitted."*

---

### Q4: "How does your pipeline handle network failures and rate limits?"
**Answer:**
> *"We implement defense-in-depth across the HTTP client and scraper:*
>
> 1. ***Error Classification:*** *We only retry transient errors (HTTP 408, 429, 5xx, timeouts, connection resets). Permanent client errors like 404 or 403 are failed immediately.*
> 2. ***Exponential Backoff with Full Jitter:*** *Retries wait $2^n$ seconds with random jitter to prevent the thundering herd problem. We also parse and respect the HTTP `Retry-After` header when throttled with HTTP 429.*
> 3. ***Politeness Jitter:*** *We introduce a randomized delay of 1.5s to 4.0s between page crawls, avoiding consistent mechanical request cadences.*
> 4. ***Circuit Breaker:*** *If 2 consecutive pages fail after all retries, the crawling loop breaks early rather than looping through remaining pagination links.*
> 5. ***Database Concurrency Throttling:*** *We batch upserts in chunks of 10 (`CONCURRENCY = 10`) using `Promise.allSettled`, which prevents exhausting the database connection pool while ensuring one bad record cannot fail the batch."*

---

### Q5: "What happens if someone triggers a manual scrape while the cron job is running?"
**Answer:**
> *"We implemented an in-process concurrency lock in `src/pipeline/pipeline.js`.*
>
> *When a scrape starts, an in-memory lock (`currentRun`) is acquired. If a manual request hits `POST /api/scrape/trigger` while the cron job is active, the API immediately returns `HTTP 409 Conflict` with the current run's metadata, preventing duplicated remote traffic and write contention.*
>
> *If we scale horizontally to multiple Node.js instances, this in-memory lock would be replaced with a distributed lock using Redis (`SET key uuid NX PX 60000`) or PostgreSQL advisory locks (`pg_try_advisory_lock`)."*

---

### Q6: "Why PostgreSQL + Prisma rather than MongoDB?"
**Answer:**
> *"PostgreSQL provides ACID guarantees and native, atomic `ON CONFLICT` constraints. In a data aggregation pipeline where data integrity and unique constraints are paramount, relational constraints prevent orphaned or duplicate entries at the database engine level.*
>
> *Furthermore, relational B-tree composite indexes (`[company, postedDate DESC]`) allow fast, indexed range queries and sorting for the REST API. Prisma provides a type-safe query builder, declarative schema migrations, and connection pool management out of the box."*

---

## 3. System Design Evolution: "How Would You Scale This to 100+ Boards?"

If asked how to evolve this prototype into a large-scale production system:

1. **Decouple Scraping from Ingestion via Message Queue:**
   - Instead of scraping and upserting in the same process, the scraper pushes parsed job JSON payloads to **RabbitMQ** or **AWS SQS**.
   - Dedicated ingestion workers consume from the queue and write to PostgreSQL in bulk.

2. **Distributed Scheduling:**
   - Replace in-process `node-cron` with a distributed scheduler like **Temporal**, **BullMQ** (Redis-backed), or cloud-native cron (**AWS EventBridge** / **Cloud Scheduler**).

3. **Proxy Rotation & CAPTCHA Evasion:**
   - Integrate rotating residential proxies (e.g. BrightData) and randomize headers/TLS fingerprints using tools like `curl-impersonate` if expanding to protected job boards.

4. **Database Scaling:**
   - Migrate from offset pagination (`skip/take`) to cursor-based keyset pagination (`WHERE (postedDate, id) < ($lastDate, $lastId)`) to maintain $O(\log n)$ performance on millions of rows.
