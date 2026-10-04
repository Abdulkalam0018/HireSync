/**
 * Realistic tech internship listings with official company career portals.
 *
 * Each posting includes:
 *   - Real company name (Supabase, Vercel, Neon, Stripe, Cloudflare, etc.)
 *   - Official careers/apply URL (directly to company portal)
 *   - Defensively structured attributes to exercise the parser (fallbacks, relative dates, legacy layouts).
 */
module.exports = [
  { id: 1001, title: 'Backend Engineering Intern', company: 'Supabase', location: 'Remote', applyUrl: 'https://supabase.com/careers', posted: { daysAgo: 1 }, featured: true },
  { id: 1002, title: 'Software Engineer Intern (Node.js)', company: 'Vercel', location: 'Remote', applyUrl: 'https://vercel.com/careers', posted: { relative: '3 days ago' } },
  { id: 1003, title: 'Database Systems Intern', company: 'Neon', location: 'San Francisco, CA', applyUrl: 'https://neon.tech/careers', posted: { daysAgo: 2 } },
  { id: 1004, title: 'Platform Engineering Intern', company: 'Razorpay', location: 'Bengaluru, India', applyUrl: 'https://razorpay.com/jobs/', posted: { relative: 'yesterday' }, layout: 'legacy' },
  { id: 1005, title: 'API & Developer Tools Intern', company: 'Postman', location: 'Bengaluru, India', applyUrl: 'https://www.postman.com/company/careers/', posted: { daysAgo: 5 } },
  { id: 1006, title: 'Infrastructure Intern', company: 'Cloudflare', location: null, applyUrl: 'https://www.cloudflare.com/careers/', posted: { relative: '2 weeks ago' } },
  { id: 1007, title: 'Payments Infrastructure Intern', company: 'Stripe', location: 'Seattle, WA', applyUrl: 'https://stripe.com/jobs', posted: { text: 'Sep 20, 2026' } },
  { id: 1008, title: 'API Developer Intern', company: null, location: 'Remote', applyUrl: 'https://www.ycombinator.com/jobs', posted: { daysAgo: 1 } }, // Missing company -> skipped
  { id: 1009, title: 'Site Reliability Intern', company: 'Datadog', location: 'New York, NY', applyUrl: 'https://www.datadoghq.com/careers/', posted: null, noId: true },
  { id: 1010, title: 'Developer Experience Intern', company: 'GitHub', location: 'Remote', applyUrl: 'https://github.com/about/careers', posted: { daysAgo: 4 }, layout: 'legacy', noId: true },
  { id: 1011, title: 'Security Engineering Intern', company: 'Cloudflare', location: 'Austin, TX', applyUrl: 'https://www.cloudflare.com/careers/', posted: { relative: 'an hour ago' } },
  { id: 1012, title: 'Cloud Data Intern', company: 'Neon', location: 'Remote', applyUrl: 'https://neon.tech/careers', posted: { daysAgo: 7 } },
  { id: 1013, title: 'DevOps Intern', company: 'Swiggy', location: 'Hyderabad, India', applyUrl: 'https://careers.swiggy.com/', posted: { daysAgo: 3 } },
  { id: 1014, title: 'Distributed Storage Intern', company: 'Supabase', location: 'Remote', applyUrl: 'https://supabase.com/careers', posted: { relative: '5 days ago' } },
  { id: 1015, title: 'Frontend Systems Intern', company: 'Vercel', location: 'Remote', applyUrl: 'https://vercel.com/careers', posted: { daysAgo: 6 }, layout: 'legacy' },
  { id: 1016, title: 'Backend Systems Intern (Go)', company: 'Docker', location: 'Remote', applyUrl: 'https://www.docker.com/careers/', posted: { daysAgo: 2 } },
  { id: 1017, title: 'Search & Data Platform Intern', company: 'Elastic', location: 'Mountain View, CA', applyUrl: 'https://www.elastic.co/about/careers', posted: { relative: '30+ days ago' } },
  { id: 1018, title: 'Cloud Infrastructure Intern', company: 'HashiCorp', location: 'Boston, MA', applyUrl: 'https://www.hashicorp.com/careers', posted: { daysAgo: 1 } },
  { id: 1019, title: 'Core Backend Intern', company: 'Zepto', location: 'Bengaluru, India', applyUrl: 'https://www.zeptonow.com/careers', posted: { daysAgo: 8 } },
  { id: 1020, title: 'Open Source Engineering Intern', company: 'GitLab', location: 'Remote', applyUrl: 'https://about.gitlab.com/jobs/', posted: { relative: '4 days ago' } },
];
