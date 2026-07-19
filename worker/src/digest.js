/**
 * Weekly VA job digest - shared logic.
 *
 * Imported by both the Worker's scheduled handler (src/index.js) and the
 * manual CLI runner (scripts/weekly-digest.mjs), so the email that goes out
 * on a cron is byte-identical to one built by hand.
 *
 * Uses only fetch and standard JS so it runs unchanged on Workers and Node.
 */

export const WORKER_JOBS_URL = 'https://virtueasy-va-job-board.morgan-2bf.workers.dev/jobs';
export const ML_API = 'https://connect.mailerlite.com/api';
export const GROUP_ID = '185458839430104953';
export const FROM = 'hello@virtueasy.com';
export const FROM_NAME = 'Virtueasy';

// Must match EARLY_ACCESS_DAYS in va-job-board.html. If these drift, the
// email either repeats jobs the board already shows or skips jobs entirely.
export const EARLY_ACCESS_DAYS = 7;

const PINK = '#FF1F7A';
const INK = '#111111';
const MUTED = '#6b6b6b';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function daysAgo(dateStr) {
  const d = (Date.now() - new Date(dateStr).getTime()) / 86400000;
  if (d < 1) return 'today';
  if (d < 2) return 'yesterday';
  return `${Math.floor(d)}d ago`;
}

/**
 * @param jobsService Optional Worker service binding. Required when running
 *   inside the Worker: fetching the job board's workers.dev URL from another
 *   Worker on the same subdomain loops back to the caller instead of
 *   reaching it. Node has no such problem and passes nothing.
 */
export async function fetchJobs(jobsService = null) {
  const url = `${WORKER_JOBS_URL}?t=${Date.now()}`;
  const res = jobsService
    ? await jobsService.fetch(new Request(url))
    : await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`job feed returned HTTP ${res.status}`);
  const data = await res.json();
  const jobs = data.jobs || [];
  if (!jobs.length) throw new Error('job feed returned zero jobs - refusing to build an empty digest');
  return jobs;
}

/**
 * Keep only jobs still inside the early-access window. A job with an
 * unparseable date is EXCLUDED here (the board treats it as public), so the
 * two rules stay complementary and no job is both public and "exclusive".
 */
export function selectEarlyAccess(jobs) {
  const cutoff = Date.now() - EARLY_ACCESS_DAYS * 86400000;
  const seen = new Set();
  return jobs
    .filter(j => {
      const t = new Date(j.postedAt).getTime();
      return !isNaN(t) && t > cutoff;
    })
    .filter(j => {
      // The feed aggregates several sources; guard against the same role
      // appearing twice under different ids.
      const key = `${(j.title || '').toLowerCase().trim()}|${(j.company || '').toLowerCase().trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
}

/**
 * The feed aggregates sources that label categories differently - the same
 * category arrives as both "Virtual Assistant" and "virtual-assistant",
 * which would render as two separate sections in the email.
 */
export function normalizeCategory(raw) {
  const base = String(raw || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (!base || base === 'other') return 'Other Remote Jobs';

  const synonyms = {
    admin: 'Administrative',
    administrative: 'Administrative',
    'admin support': 'Administrative',
    va: 'Virtual Assistant',
    'virtual assistant': 'Virtual Assistant',
    'executive assistant': 'Executive Assistant',
    'social media': 'Social Media',
    'online business manager': 'Online Business Manager',
    obm: 'Online Business Manager',
  };
  if (synonyms[base]) return synonyms[base];

  return base.replace(/\b\w/g, c => c.toUpperCase());
}

function groupByCategory(jobs) {
  const groups = new Map();
  for (const j of jobs) {
    const cat = normalizeCategory(j.category);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(j);
  }
  // Biggest categories first so the email leads with substance.
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
}

function renderJob(job) {
  const salary = job.salary
    ? `<span style="color:${INK};font-weight:600;">${esc(job.salary)}</span> &nbsp;&middot;&nbsp; `
    : '';
  return `
  <tr>
    <td style="padding:14px 0;border-bottom:1px solid #ececec;">
      <a href="${esc(job.url)}" style="color:${INK};font-size:16px;font-weight:600;text-decoration:none;">${esc(job.title)}</a>
      <div style="color:${MUTED};font-size:14px;margin-top:3px;">${esc(job.company || 'Company not listed')}</div>
      <div style="color:${MUTED};font-size:13px;margin-top:6px;">
        ${salary}${esc(job.type || 'Remote')} &nbsp;&middot;&nbsp; ${esc(daysAgo(job.postedAt))} &nbsp;&middot;&nbsp; ${esc(job.source || '')}
      </div>
      <a href="${esc(job.url)}" style="color:${PINK};font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.06em;">APPLY &rarr;</a>
    </td>
  </tr>`;
}

export function renderEmail(jobs) {
  const grouped = groupByCategory(jobs);
  const sections = grouped.map(([cat, list]) => `
    <tr><td style="padding:28px 0 4px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${PINK};">
        ${esc(cat)} (${list.length})
      </div>
    </td></tr>
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        ${list.map(renderJob).join('')}
      </table>
    </td></tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f4;padding:24px 12px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background:#ffffff;padding:32px;font-family:Helvetica,Arial,sans-serif;">

  <tr><td style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${PINK};">
    Subscriber early access
  </td></tr>

  <tr><td style="padding-top:8px;">
    <h1 style="margin:0;font-size:30px;line-height:1.15;color:${INK};">${jobs.length} new VA jobs this week</h1>
  </td></tr>

  <tr><td style="padding-top:12px;color:${MUTED};font-size:15px;line-height:1.6;">
    These are not on the public board yet. They go up in a week, after you have
    had first crack at them. Apply early &mdash; that is the whole advantage.
  </td></tr>

  ${sections}

  <tr><td style="padding-top:32px;">
    <a href="https://virtueasy.com/starterkit/" style="background:${PINK};color:#ffffff;font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 28px;display:inline-block;">
      Get the VA Starter Kit
    </a>
  </td></tr>

  <tr><td style="padding-top:32px;border-top:1px solid #ececec;color:${MUTED};font-size:12px;line-height:1.6;">
    You are getting this because you signed up for early access on the
    <a href="https://virtueasy.com/va-job-board" style="color:${MUTED};">Virtueasy job board</a>.<br>
    <a href="{$unsubscribe}" style="color:${MUTED};">Unsubscribe</a> &nbsp;&middot;&nbsp; {$account.company}
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Monday reminder that the draft is waiting. Mirrors the AIOS worker's
 * Resend setup (same RESEND_KEY, same onboarding@resend.dev sender).
 *
 * Sends only to REPORT_TO. It has no access to the MailerLite subscriber
 * list and cannot reach it - that separation is deliberate.
 */
export async function sendReminder(env, result) {
  if (!env.RESEND_KEY) return { skipped: 'no RESEND_KEY configured' };

  const to = env.REPORT_TO || 'morganmessick@gmail.com';
  let subject, body;

  if (result.status === 'created') {
    subject = `${result.count} VA jobs ready to review`;
    body = `
      <p style="font-size:16px;">This week's job digest is built and waiting as a <strong>draft</strong>.</p>
      <p style="font-size:16px;">
        <strong>${result.count} jobs</strong> &nbsp;&middot;&nbsp; ${result.name}<br>
        Subject line: ${result.subject}
      </p>
      <p><a href="${result.reviewUrl}" style="background:#FF1F7A;color:#fff;padding:12px 24px;text-decoration:none;font-weight:700;display:inline-block;">Review and send</a></p>
      <p style="color:#6b6b6b;font-size:13px;">Nothing goes out until you send it. Goes to 145 subscribers.</p>`;
  } else if (result.status === 'skipped') {
    subject = `VA digest skipped this week`;
    body = `<p style="font-size:16px;">No draft was created: <strong>${result.reason}</strong>.</p>
            <p style="color:#6b6b6b;font-size:13px;">Nothing is wrong if this says there were no new jobs.</p>`;
  } else {
    subject = `VA digest FAILED`;
    body = `<p style="font-size:16px;">The weekly digest did not run.</p>
            <pre style="background:#f4f4f4;padding:12px;font-size:13px;white-space:pre-wrap;">${result.error}</pre>
            <p style="color:#6b6b6b;font-size:13px;">No draft exists for this week. Check <code>npx wrangler tail</code>.</p>`;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: 'Virtueasy Jobs <onboarding@resend.dev>',
      to: [to],
      subject,
      html: `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;">${body}</div>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { sent: true, to };
}

export function weekStamp(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function campaignName(stamp = weekStamp()) {
  return `VA Job Digest - week of ${stamp}`;
}

async function ml(apiKey, path, options = {}) {
  const res = await fetch(`${ML_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  const raw = await res.text();
  let body = null;
  try { body = JSON.parse(raw); } catch { /* non-JSON error page */ }
  return { ok: res.ok, status: res.status, body, raw };
}

/** Guard against a double-run creating two identical drafts for one week. */
async function draftExists(apiKey, name) {
  const res = await ml(apiKey, '/campaigns?filter[status]=draft&limit=25');
  if (!res.ok) return false; // Non-fatal: worst case a duplicate draft to delete.
  return (res.body?.data || []).some(c => c.name === name);
}

/**
 * Build this week's digest and create it as a MailerLite DRAFT.
 *
 * Never sends and never schedules. Sending stays a human decision made in
 * the MailerLite UI. Returns a result object describing what happened.
 */
export async function createDigestDraft(apiKey, jobsService = null) {
  const all = await fetchJobs(jobsService);
  const jobs = selectEarlyAccess(all);

  if (!jobs.length) {
    return { status: 'skipped', reason: 'no new jobs this week', total: all.length, count: 0 };
  }

  const name = campaignName();
  if (await draftExists(apiKey, name)) {
    return { status: 'skipped', reason: 'draft already exists for this week', name, count: jobs.length };
  }

  const subject = `${jobs.length} new VA jobs (before they go public)`;
  const html = renderEmail(jobs);

  const res = await ml(apiKey, '/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      name,
      type: 'regular',
      groups: [GROUP_ID],
      emails: [{ subject, from: FROM, from_name: FROM_NAME, content: html }],
    }),
  });

  if (!res.ok) {
    throw new Error(`MailerLite HTTP ${res.status}: ${res.raw.slice(0, 300)}`);
  }

  const c = res.body.data;
  return {
    status: 'created',
    id: c.id,
    name,
    subject,
    count: jobs.length,
    total: all.length,
    reviewUrl: `https://dashboard.mailerlite.com/campaigns/${c.id}/edit`,
  };
}
