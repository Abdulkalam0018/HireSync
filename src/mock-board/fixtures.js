/**
 * Fake job data for the mock board.
 *
 * Deliberately MESSY to exercise every defensive path in the scraper:
 *   layout: 'legacy'   -> old HTML markup, forces FALLBACK selectors
 *   noId: true         -> card has no data-job-id, ID must come from the URL
 *   location: null     -> optional field missing, default is used
 *   company: null      -> required field missing, card must be SKIPPED
 *   featured: true     -> repeated at the top of EVERY page (in-run duplicate)
 *   posted: { daysAgo } | { relative } | { text } | null -> every date format
 */
module.exports = [
  { id: 1001, title: 'Backend Engineering Intern', company: 'Acme AI', location: 'San Francisco, CA', posted: { daysAgo: 1 }, featured: true },
  { id: 1002, title: 'Software Engineer Intern (Node.js)', company: 'Rocketship', location: 'Remote', posted: { relative: '3 days ago' } },
  { id: 1003, title: 'Data Engineering Intern', company: 'Pipeline Labs', location: 'New York, NY', posted: { daysAgo: 2 } },
  { id: 1004, title: 'Platform Engineering Intern', company: 'CloudNest', location: 'Bengaluru, India', posted: { relative: 'yesterday' }, layout: 'legacy' },
  { id: 1005, title: 'Full Stack Intern', company: 'Acme AI', location: 'Remote', posted: { daysAgo: 5 } },
  { id: 1006, title: 'Infrastructure Intern', company: 'Deploybot', location: null, posted: { relative: '2 weeks ago' } },
  { id: 1007, title: 'Machine Learning Intern', company: 'Neuron Works', location: 'Boston, MA', posted: { text: 'Sep 20, 2026' } },
  { id: 1008, title: 'API Developer Intern', company: null, location: 'Remote', posted: { daysAgo: 1 } },
  { id: 1009, title: 'Site Reliability Intern', company: 'Uptime Co', location: 'Austin, TX', posted: null, noId: true },
  { id: 1010, title: 'Backend Intern - Payments', company: 'Ledgerly', location: 'London, UK', posted: { daysAgo: 4 }, layout: 'legacy', noId: true },
  { id: 1011, title: 'Security Engineering Intern', company: 'Fortify', location: 'Remote', posted: { relative: 'an hour ago' } },
  { id: 1012, title: 'Database Intern', company: 'Pipeline Labs', location: 'New York, NY', posted: { daysAgo: 7 } },
  { id: 1013, title: 'DevOps Intern', company: 'CloudNest', location: 'Hyderabad, India', posted: { daysAgo: 3 } },
  { id: 1014, title: 'Search Infrastructure Intern', company: 'Findly', location: 'Seattle, WA', posted: { relative: '5 days ago' } },
  { id: 1015, title: 'Distributed Systems Intern', company: 'Rocketship', location: 'Remote', posted: { daysAgo: 6 }, layout: 'legacy' },
  { id: 1016, title: 'Backend Engineer Intern (Go)', company: 'Gopher Inc', location: 'Toronto, Canada', posted: { daysAgo: 2 } },
  { id: 1017, title: 'Developer Tools Intern', company: 'Deploybot', location: 'Remote', posted: { relative: '30+ days ago' } },
  { id: 1018, title: 'Data Platform Intern', company: 'Neuron Works', location: 'Boston, MA', posted: { daysAgo: 1 } },
  { id: 1019, title: 'Cloud Engineering Intern', company: 'Uptime Co', location: 'Pune, India', posted: { daysAgo: 8 } },
  { id: 1020, title: 'Software Engineering Intern', company: 'Ledgerly', location: 'Remote', posted: { relative: '4 days ago' } },
];
