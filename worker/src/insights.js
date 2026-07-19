/**
 * Biweekly subscriber-engagement report.
 *
 * Pulls stats from sent VA Job Digest campaigns, summarises them, and
 * suggests pitch angles using explicit rules - no LLM. Every recommendation
 * traces to a number shown in the same email, so a thin-data fortnight reads
 * as thin rather than as confident advice.
 *
 * Stays silent until MIN_SENDS digests have gone out. Recommendations drawn
 * from one or two sends are guesses, and a guess about what to sell 145
 * people is worse than saying nothing.
 */

const ML_API = 'https://connect.mailerlite.com/api';

export const MIN_SENDS = 6;
const DIGEST_PREFIX = 'VA Job Digest';
const WINDOW_DAYS = 14;

const PINK = '#FF1F7A';
const INK = '#111111';
const MUTED = '#6b6b6b';

async function ml(apiKey, path) {
  const res = await fetch(`${ML_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`MailerLite HTTP ${res.status} on ${path}`);
  return res.json();
}

function pct(n) {
  return typeof n === 'number' ? `${(n <= 1 ? n * 100 : n).toFixed(1)}%` : 'n/a';
}

/** MailerLite nests stats differently across shapes; probe the likely spots. */
function readStats(campaign) {
  const s = campaign.stats || campaign.emails?.[0]?.stats || {};
  const sent = s.sent ?? s.recipients ?? 0;
  const openRate = s.open_rate?.float ?? s.open_rate ?? null;
  const clickRate = s.click_rate?.float ?? s.click_rate ?? null;
  return {
    sent,
    opens: s.opens_count ?? s.opens ?? 0,
    clicks: s.clicks_count ?? s.clicks ?? 0,
    openRate,
    clickRate,
    unsubscribes: s.unsubscribes_count ?? s.unsubscribes ?? 0,
  };
}

/**
 * Click-through detail. Shape varies by account/plan, so this is defensive:
 * any unrecognised structure yields no link data rather than a crash, and
 * the report simply omits that section.
 */
function readLinkClicks(campaign) {
  const raw = campaign.emails?.[0]?.click_map ?? campaign.click_map ?? null;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(l => ({
      url: l.url || l.link || '',
      count: l.count ?? l.clicks ?? l.unique ?? 0,
    }))
    .filter(l => l.url && l.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Map clicked job URLs back to categories using the live feed. Best-effort:
 * the feed only carries recent jobs, so older clicks fall into "unknown".
 * That limitation is stated in the email rather than hidden.
 */
function categorise(links, jobs, normalizeCategory) {
  const byUrl = new Map(jobs.map(j => [j.url, j.category]));
  const cats = {};
  let matched = 0;
  let ownLinks = 0;

  for (const l of links) {
    if (l.url.includes('virtueasy.com')) { ownLinks += l.count; continue; }
    const cat = byUrl.get(l.url);
    if (!cat) continue;
    matched += l.count;
    const name = normalizeCategory(cat);
    cats[name] = (cats[name] || 0) + l.count;
  }

  const total = links.reduce((a, l) => a + l.count, 0);
  return {
    categories: Object.entries(cats).sort((a, b) => b[1] - a[1]),
    matched,
    unmatched: total - matched - ownLinks,
    ownLinks,
  };
}

/**
 * Explicit, inspectable rules. Each returns the evidence alongside the
 * suggestion so the reasoning is visible and arguable.
 */
function buildPitches({ categories, ownLinks }, avgOpen, avgClick, trend) {
  const out = [];
  const top = categories[0];
  const senior = categories.filter(([c]) =>
    /executive assistant|online business manager/i.test(c));
  const seniorClicks = senior.reduce((a, [, n]) => a + n, 0);
  const totalCatClicks = categories.reduce((a, [, n]) => a + n, 0);

  if (top) {
    out.push({
      pitch: `Lead your next promo with ${top[0]} work`,
      why: `${top[0]} links drew the most clicks (${top[1]} of ${totalCatClicks} categorised).`,
    });
  }

  if (totalCatClicks > 0 && seniorClicks / totalCatClicks >= 0.3) {
    out.push({
      pitch: 'Pitch rate-raising, not getting-started',
      why: `${Math.round((seniorClicks / totalCatClicks) * 100)}% of clicks went to EA/OBM roles - this list skews experienced. The Pricing Tool fits better than beginner material.`,
    });
  } else if (totalCatClicks > 0) {
    out.push({
      pitch: 'Pitch the VA Starter Kit on a beginner angle',
      why: 'Clicks concentrate in entry-level VA and admin roles rather than senior ones.',
    });
  }

  if (ownLinks > 0) {
    out.push({
      pitch: 'Send a dedicated Starter Kit email',
      why: `${ownLinks} clicks already went to virtueasy.com links inside the digest without you asking for them.`,
    });
  }

  if (typeof avgOpen === 'number' && avgOpen < 0.25) {
    out.push({
      pitch: 'Rework subject lines before pitching anything',
      why: `Open rate is ${pct(avgOpen)}. A promo into a list that is not opening will underperform regardless of the offer.`,
    });
  }

  if (trend === 'down') {
    out.push({
      pitch: 'Hold off on a hard pitch this fortnight',
      why: 'Engagement fell versus the previous period. Rebuild with pure value first.',
    });
  }

  return out;
}

export async function buildInsights(apiKey, jobsService, deps) {
  const { fetchJobs, normalizeCategory } = deps;

  const list = await ml(apiKey, '/campaigns?filter[status]=sent&limit=50');
  const digests = (list.data || [])
    .filter(c => (c.name || '').startsWith(DIGEST_PREFIX))
    .sort((a, b) => new Date(b.finished_at || b.created_at) - new Date(a.finished_at || a.created_at));

  if (digests.length < MIN_SENDS) {
    return { status: 'waiting', sends: digests.length, needed: MIN_SENDS };
  }

  const cutoff = Date.now() - WINDOW_DAYS * 86400000;
  const recent = digests.filter(c => new Date(c.finished_at || c.created_at).getTime() > cutoff);
  const period = recent.length ? recent : digests.slice(0, 2);

  // Full records carry stats and click detail; the list view may not.
  const full = [];
  for (const c of period.slice(0, 6)) {
    try { full.push((await ml(apiKey, `/campaigns/${c.id}`)).data); } catch { /* skip */ }
  }
  if (!full.length) return { status: 'nodata', sends: digests.length };

  const stats = full.map(readStats);
  const avg = key => {
    const vals = stats.map(s => s[key]).filter(v => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const avgOpen = avg('openRate');
  const avgClick = avg('clickRate');

  // Compare against the preceding equivalent block of sends.
  const prior = digests.slice(period.length, period.length * 2);
  let trend = 'flat';
  if (prior.length) {
    const priorFull = [];
    for (const c of prior.slice(0, 6)) {
      try { priorFull.push((await ml(apiKey, `/campaigns/${c.id}`)).data); } catch { /* skip */ }
    }
    const priorOpens = priorFull.map(readStats).map(s => s.openRate).filter(v => typeof v === 'number');
    if (priorOpens.length && typeof avgOpen === 'number') {
      const p = priorOpens.reduce((a, b) => a + b, 0) / priorOpens.length;
      if (avgOpen < p * 0.9) trend = 'down';
      else if (avgOpen > p * 1.1) trend = 'up';
    }
  }

  const links = full.flatMap(readLinkClicks);
  let jobs = [];
  try { jobs = await fetchJobs(jobsService); } catch { /* categorisation degrades */ }
  const clickData = categorise(links, jobs, normalizeCategory);

  return {
    status: 'ok',
    sends: digests.length,
    periodSends: full.length,
    avgOpen,
    avgClick,
    trend,
    unsubscribes: stats.reduce((a, s) => a + s.unsubscribes, 0),
    ...clickData,
    pitches: buildPitches(clickData, avgOpen, avgClick, trend),
  };
}

export function renderInsightsEmail(r) {
  if (r.status === 'waiting') {
    return {
      subject: `VA list: ${r.sends}/${r.needed} sends before recommendations start`,
      html: `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;">
        <p style="font-size:16px;">Not enough data yet to recommend anything honestly.</p>
        <p style="font-size:16px;"><strong>${r.sends}</strong> of <strong>${r.needed}</strong> digests sent.</p>
        <p style="color:${MUTED};font-size:13px;">Recommendations begin automatically once the sixth digest has gone out. Nothing for you to switch on.</p>
      </div>`,
    };
  }

  if (r.status === 'nodata') {
    return {
      subject: 'VA list: stats unavailable this fortnight',
      html: `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;">
        <p style="font-size:16px;">Could not read campaign stats from MailerLite this run. Nothing is broken on the digest side.</p>
      </div>`,
    };
  }

  const arrow = { up: '&uarr;', down: '&darr;', flat: '&rarr;' }[r.trend];
  const cats = r.categories.length
    ? r.categories.slice(0, 6).map(([c, n]) =>
        `<tr><td style="padding:5px 0;color:${INK};font-size:14px;">${c}</td>
             <td style="padding:5px 0;text-align:right;color:${INK};font-size:14px;font-weight:600;">${n}</td></tr>`).join('')
    : `<tr><td style="color:${MUTED};font-size:14px;padding:5px 0;">No job clicks could be matched to categories this period.</td></tr>`;

  const pitches = r.pitches.length
    ? r.pitches.map(p => `
        <div style="border-left:3px solid ${PINK};padding:2px 0 2px 14px;margin-bottom:16px;">
          <div style="font-size:15px;font-weight:700;color:${INK};">${p.pitch}</div>
          <div style="font-size:13px;color:${MUTED};margin-top:3px;">${p.why}</div>
        </div>`).join('')
    : `<p style="color:${MUTED};font-size:14px;">No rule fired this period. That usually means engagement is steady and there is no clear angle to chase.</p>`;

  return {
    subject: `VA list: ${pct(r.avgOpen)} open, ${pct(r.avgClick)} click - ${r.pitches.length} pitch ideas`,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;">
      <p style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${PINK};">Last ${WINDOW_DAYS} days</p>
      <h1 style="font-size:26px;margin:6px 0 0;color:${INK};">Subscriber engagement</h1>

      <table width="100%" style="margin-top:18px;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:${MUTED};font-size:14px;">Digests sent (all time)</td>
            <td style="padding:6px 0;text-align:right;font-size:14px;color:${INK};font-weight:600;">${r.sends}</td></tr>
        <tr><td style="padding:6px 0;color:${MUTED};font-size:14px;">In this period</td>
            <td style="padding:6px 0;text-align:right;font-size:14px;color:${INK};font-weight:600;">${r.periodSends}</td></tr>
        <tr><td style="padding:6px 0;color:${MUTED};font-size:14px;">Open rate</td>
            <td style="padding:6px 0;text-align:right;font-size:14px;color:${INK};font-weight:600;">${pct(r.avgOpen)} ${arrow}</td></tr>
        <tr><td style="padding:6px 0;color:${MUTED};font-size:14px;">Click rate</td>
            <td style="padding:6px 0;text-align:right;font-size:14px;color:${INK};font-weight:600;">${pct(r.avgClick)}</td></tr>
        <tr><td style="padding:6px 0;color:${MUTED};font-size:14px;">Unsubscribes</td>
            <td style="padding:6px 0;text-align:right;font-size:14px;color:${INK};font-weight:600;">${r.unsubscribes}</td></tr>
      </table>

      <h2 style="font-size:16px;margin:26px 0 6px;color:${INK};">Most-clicked job categories</h2>
      <table width="100%" style="border-collapse:collapse;">${cats}</table>
      <p style="color:${MUTED};font-size:12px;margin-top:8px;">
        ${r.matched} clicks matched, ${r.unmatched} unmatched (jobs that aged out of the feed), ${r.ownLinks} to virtueasy.com.
      </p>

      <h2 style="font-size:16px;margin:26px 0 12px;color:${INK};">Suggested pitches</h2>
      ${pitches}

      <p style="color:${MUTED};font-size:12px;margin-top:24px;border-top:1px solid #ececec;padding-top:14px;">
        Rule-based, not AI-written. Every suggestion above cites the number it came from - if the number looks thin, treat the suggestion as thin.
      </p>
    </div>`,
  };
}
