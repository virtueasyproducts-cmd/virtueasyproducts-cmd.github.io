const JOBICY_API = "https://jobicy.com/api/v2/remote-jobs";
const REMOTIVE_API = "https://remotive.com/api/remote-jobs";
const REMOTEOK_API = "https://remoteok.com/api";
const HIMALAYAS_API = "https://himalayas.app/jobs/api/search";
const FREELANCER_API = "https://www.freelancer.com/api/projects/0.1/projects/active";

// ── QUERIES & FEEDS ──────────────────────────────────────────────

const REMOTEOK_TAGS = ["virtual-assistant", "assistant", "admin", "operations", "social-media"];
const HIMALAYAS_QUERIES = ["virtual assistant", "executive assistant", "operations coordinator", "administrative assistant", "personal assistant", "social media assistant"];
const JOBICY_QUERIES = [{ industry: "admin-support" }, { industry: "smm" }];
const REMOTIVE_CATEGORIES = ["virtual-assistant", "business", "admin"];
const WWR_FEEDS = [{ url: "https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss", category: "management" }];
const FREELANCER_QUERIES = ["virtual assistant", "data entry", "executive assistant"];

// JSearch (RapidAPI) Query - Aggregates LinkedIn, Indeed, Glassdoor, etc.
const JSEARCH_QUERY = "Virtual Assistant"; 

// UPWORK RSS LINK
const UPWORK_RSS_URL = "https://www.upwork.com/ab/feed/jobs/rss?proposals=0-4,5-9,10-14&q=virtual%20assistant";

// ── REFINED FILTERS ──────────────────────────────────────────────

const REQUIRE_TITLE_KEYWORDS = [
  "virtual assistant", "executive assistant", "administrative", "admin",
  "personal assistant", "assistant", "ea", "va", "secretary", "receptionist",
  "office manager", "chief of staff", "clerk", "data entry", "bookkeeper",
  "operations", "coordinator", "associate", "specialist", "project manager", 
  "project assistant", "social media", "community manager", "content coordinator"
];

const EXCLUDE_TITLE_KEYWORDS = [
  "engineer", "developer", "software", "backend", "frontend", "fullstack",
  "ios", "android", "devops", "qa", "site reliability", "machine learning", 
  "data scientist", "security", "network", "cloud", "blockchain", "crypto",
  "sysadmin", "it support", "vp", "director", "president", "head of", "principal", 
  "nurse", "physician", "surgeon", "therapist", "counselor", "medical", "dental",
  "attorney", "lawyer", "call center", "customer support", "customer service",
  "help desk", "helpdesk", "technical support"
];

const EXCLUDE_COMPANY_KEYWORDS = ["staffing", "recruiting", "temp agency", "hospital", "law firm"];

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isTitleAllowed(title) {
  const t = title.toLowerCase();
  const hasExcluded = EXCLUDE_TITLE_KEYWORDS.some(kw => new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i').test(t));
  if (hasExcluded) return false;
  return REQUIRE_TITLE_KEYWORDS.some(kw => new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i').test(t));
}

function isCompanyAllowed(company) {
  if (!company) return true;
  return !EXCLUDE_COMPANY_KEYWORDS.some(kw => company.toLowerCase().includes(kw));
}

function isRecent(postedAt) {
  if (!postedAt) return false; 
  const postDate = new Date(postedAt);
  if (isNaN(postDate.getTime())) return true; 
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  return postDate >= fourWeeksAgo;
}

// ── FETCH FUNCTIONS ──────────────────────────────────────────────

async function fetchJSearch(query, env) {
  if (!env || !env.RAPIDAPI_KEY) return [];

  const params = new URLSearchParams({
    query: query,
    page: '1',
    num_pages: '1',
    date_posted: 'month', 
    work_from_home: 'true' 
  });

  const url = `https://jsearch.p.rapidapi.com/search?${params}`;
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'jsearch.p.rapidapi.com'
      }
    });
    
    if (!res.ok) return [];
    const data = await res.json();
    
    return (data.data || []).map(job => ({
      id: `jsearch-${job.job_id || Math.random().toString(36).substring(2, 9)}`,
      title: job.job_title,
      company: job.employer_name,
      type: job.job_employment_type || "Full-time",
      category: "Virtual Assistant",
      url: job.job_apply_link || job.job_google_link || url,
      postedAt: job.job_posted_at_datetime_utc || new Date().toISOString(),
      source: job.job_publisher || "JSearch",
    }));
  } catch (err) {
    console.error("JSearch error:", err.message);
    return [];
  }
}

async function fetchUpwork(url) {
  if (!url) return [];
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Virtueasy/1.0" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    return items.map(item => {
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
      let title = titleMatch ? titleMatch[1].trim() : "Unknown Job";
      title = title.replace(/\s*- Upwork$/, '');
      const guidMatch = item.match(/<guid.*?>.*?_(~.*?)<\/guid>/) || item.match(/<guid.*?>(.*?)<\/guid>/);
      const id = guidMatch ? guidMatch[1].trim() : Math.random().toString(36).substring(2, 9);
      return {
        id: `upwork-${id}`,
        title: title, company: "Upwork Client", type: "Contract", category: "Virtual Assistant",
        url: linkMatch ? linkMatch[1].trim() : "", postedAt: pubDateMatch ? pubDateMatch[1].trim() : new Date().toISOString(),
        source: "Upwork",
      };
    });
  } catch (e) { return []; }
}

async function fetchWWR({ url, category }) {
  const res = await fetch(url, { headers: { "User-Agent": "Virtueasy/1.0" } });
  if (!res.ok) return [];
  const xml = await res.text();
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  return items.map(item => {
    const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/);
    const linkMatch = item.match(/<link>(.*?)<\/link>/);
    const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
    let rawTitle = titleMatch ? titleMatch[1].trim() : "Unknown Job";
    let company = "Unknown Company", title = rawTitle;
    if (rawTitle.includes(":")) {
      const parts = rawTitle.split(":");
      company = parts[0].trim(); title = parts.slice(1).join(":").trim();
    }
    return {
      id: `wwr-${Math.random().toString(36).substring(2, 9)}`, title, company, type: "Full-time", category,
      url: linkMatch ? linkMatch[1].trim() : "", postedAt: pubDateMatch ? pubDateMatch[1].trim() : new Date().toISOString(),
      source: "WeWorkRemotely",
    };
  });
}

async function fetchFreelancer(query) {
  const params = new URLSearchParams({ query, limit: 50, compact: true });
  const res = await fetch(`${FREELANCER_API}?${params}`, { headers: { "User-Agent": "Virtueasy/1.0" } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.result.projects || []).map(p => ({
    id: `freelancer-${p.id}`, title: p.title, company: "Freelancer Client",
    type: p.type === "hourly" ? "Hourly Contract" : "Fixed Price", category: "Virtual Assistant",
    salary: p.budget ? `${p.budget.minimum}-${p.budget.maximum} ${p.currency.code}` : null,
    url: `https://www.freelancer.com/projects/${p.seo_url || p.id}`, postedAt: new Date(p.submitdate * 1000).toISOString(),
    source: "Freelancer.com",
  }));
}

async function fetchRemoteOK(tag) {
  const res = await fetch(`${REMOTEOK_API}?tag=${encodeURIComponent(tag)}`, { headers: { "User-Agent": "Virtueasy/1.0", "Accept": "application/json" } });
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data) ? data.slice(1) : []).map(j => ({
    id: `remoteok-${j.id}`, title: j.position, company: j.company, type: "Full-time", category: tag,
    url: j.url, postedAt: j.date, source: "RemoteOK",
  }));
}

async function fetchHimalayas(query) {
  const params = new URLSearchParams({ q: query, limit: 100 });
  const res = await fetch(`${HIMALAYAS_API}?${params}`, { headers: { "User-Agent": "Virtueasy/1.0" } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs || []).map(j => ({
    id: `himalayas-${j.guid}`, title: j.title, company: j.companyName, type: j.employmentType || "Full-time",
    // pubDate arrives as unix SECONDS; passed raw it parsed as Jan 1970 and isRecent() dropped nearly every Himalayas job.
    salary: j.minSalary && j.maxSalary ? `${j.minSalary}-${j.maxSalary} ${j.currency || "USD"}${j.salaryPeriod ? "/" + j.salaryPeriod : ""}` : null,
    url: j.applicationLink, postedAt: typeof j.pubDate === "number" ? new Date(j.pubDate * 1000).toISOString() : j.pubDate, source: "Himalayas",
  }));
}

async function fetchJobicy(query) {
  const params = new URLSearchParams({ count: 100, industry: query.industry });
  const res = await fetch(`${JOBICY_API}?${params}`, { headers: { "User-Agent": "Virtueasy/1.0" } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs || []).map(j => ({
    id: `jobicy-${j.id}`, title: j.jobTitle, company: j.companyName, type: j.jobType || "Full-time",
    url: j.url, postedAt: j.pubDate, source: "Jobicy",
  }));
}

async function fetchRemotive(category) {
  const params = new URLSearchParams({ limit: 100, category });
  const res = await fetch(`${REMOTIVE_API}?${params}`, { headers: { "User-Agent": "Virtueasy/1.0" } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs || []).map(j => ({
    id: `remotive-${j.id}`, title: j.title, company: j.company_name, type: j.job_type || "Full-time",
    url: j.url, postedAt: j.publication_date, source: "Remotive",
  }));
}

// ── MAIN RUNNER ──────────────────────────────────────────────────

async function runFetch(env) {
  const allJobs = [];
  
  async function fetchSequential(items, fetchFn, source, requiresEnv = false) {
    for (const item of items) {
      try { 
        const jobs = requiresEnv ? await fetchFn(item, env) : await fetchFn(item); 
        allJobs.push(...jobs); 
      } 
      catch (err) { console.error(`${source} error:`, err.message); }
    }
  }

  // Trigger all platforms to fetch data concurrently to speed up Worker execution time
  await Promise.all([
    fetchSequential(JOBICY_QUERIES, fetchJobicy, "Jobicy"),
    fetchSequential(REMOTIVE_CATEGORIES, fetchRemotive, "Remotive"),
    fetchSequential(REMOTEOK_TAGS, fetchRemoteOK, "RemoteOK"),
    fetchSequential(HIMALAYAS_QUERIES, fetchHimalayas, "Himalayas"),
    fetchSequential(WWR_FEEDS, fetchWWR, "WWR"),
    fetchSequential(FREELANCER_QUERIES, fetchFreelancer, "Freelancer"),
    fetchSequential([UPWORK_RSS_URL], fetchUpwork, "Upwork"),
    fetchSequential([JSEARCH_QUERY], fetchJSearch, "JSearch", true) // requiresEnv = true to pass the secret
  ]);

  const filtered = allJobs.filter(j => isTitleAllowed(j.title) && isCompanyAllowed(j.company) && isRecent(j.postedAt));
  
  // Final Deduplication
  const seen = new Set();
  const final = filtered.filter(j => {
    const key = `${j.company}-${j.title}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

  const payload = { updatedAt: new Date().toISOString(), count: final.length, jobs: final };
  
  // Save to Cloudflare KV Namespace (Ensure your KV is bound to the variable VA_JOBS)
  await env.VA_JOBS.put("jobs", JSON.stringify(payload));
  console.log(`Stored ${final.length} deduplicated jobs in KV`);
  
  return payload;
}

// ── WORKER EXPORT ────────────────────────────────────────────────

export default {
  // Runs based on the cron trigger you setup in Cloudflare
  async scheduled(event, env, ctx) { 
    ctx.waitUntil(runFetch(env)); 
  },
  
  // Handles manual web requests
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = { 
      "Access-Control-Allow-Origin": "*", 
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json" 
    };
    
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // Endpoint to manually force the worker to fetch new jobs right now
    if (url.pathname === "/refresh") {
      if (url.searchParams.get("secret") !== env.REFRESH_SECRET) return new Response("Unauthorized", { status: 401 });
      const res = await runFetch(env);
      return new Response(JSON.stringify({ ok: true, count: res.count, updatedAt: res.updatedAt }), { headers: cors });
    }
    
    // Endpoint your front-end website will hit to pull the jobs list
    if (url.pathname === "/jobs") {
      const data = await env.VA_JOBS.get("jobs");
      return new Response(data || '{"jobs":[], "count":0, "updatedAt":null}', { headers: cors });
    }
    
    return new Response("Not Found", { status: 404 });
  }
};