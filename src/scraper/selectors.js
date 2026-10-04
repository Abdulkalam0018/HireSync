/**
 * CSS selector configuration with FALLBACK CHAINS.
 *
 * WHY ARRAYS?
 * Websites change their HTML without warning (a redesign renames
 * `.job-title` to `.posting-title`, an A/B test serves two layouts at once).
 * A scraper with one hard-coded selector per field silently returns nothing
 * the day that happens.
 *
 * So each field lists selectors in PRIORITY ORDER:
 *   [0]  = the current, most specific selector (preferred)
 *   [1+] = older layouts / more generic fallbacks
 * The parser tries them in order and uses the first that matches. It also
 * counts how often a fallback was needed - a spike in that metric is an
 * early warning that the site's markup changed.
 *
 * Keeping selectors in config (not buried in parsing code) means adapting to
 * a new site or a redesign is a one-file change.
 *
 * Target: a simplified "YC-style" startup job board, e.g.
 *
 *   <div class="job-card" data-job-id="1001">
 *     <a class="job-title" href="/jobs/1001">Backend Engineering Intern</a>
 *     <span class="company-name">Acme AI</span>
 *     <span class="job-location">Remote</span>
 *     <time class="job-posted" datetime="2026-10-01T00:00:00Z">3 days ago</time>
 *   </div>
 *   <nav class="pagination"><a class="next" href="?page=2">Next</a></nav>
 */
module.exports = {
  // The repeating container - one per job.
  jobCard: ['.job-card', '[data-testid="job-card"]', 'li.job-listing'],

  // Fields looked up INSIDE each card.
  title: ['.job-title', 'h3.title', '[data-field="title"]'],
  company: ['.company-name', '.company', '[data-field="company"]'],
  location: ['.job-location', '.location', '[data-field="location"]'],
  postedDate: ['time[datetime]', '.job-posted', '.posted-at'],
  applyLink: ['a.apply-link', 'a.job-title', 'h3.title a', 'a[href*="/jobs/"]'],

  // Looked up on the whole page.
  nextPage: ['a.next', 'a[rel="next"]', '.pagination a:contains("Next")'],
};
