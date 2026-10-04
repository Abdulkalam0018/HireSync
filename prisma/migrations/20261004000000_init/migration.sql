-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "job_postings" (
    "id" SERIAL NOT NULL,
    "externalJobId" VARCHAR(255) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "company" VARCHAR(200) NOT NULL,
    "location" VARCHAR(200) NOT NULL,
    "applyUrl" VARCHAR(2048) NOT NULL,
    "postedDate" TIMESTAMP(3),
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_postings_externalJobId_key" ON "job_postings"("externalJobId");

-- CreateIndex
CREATE INDEX "job_postings_postedDate_idx" ON "job_postings"("postedDate" DESC);

-- CreateIndex
CREATE INDEX "job_postings_company_idx" ON "job_postings"("company");

-- CreateIndex
CREATE INDEX "job_postings_company_postedDate_idx" ON "job_postings"("company", "postedDate" DESC);

-- CreateIndex
CREATE INDEX "job_postings_scrapedAt_idx" ON "job_postings"("scrapedAt");
