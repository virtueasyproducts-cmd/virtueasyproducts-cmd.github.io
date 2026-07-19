#!/usr/bin/env node
/**
 * Weekly VA job digest -> MailerLite DRAFT campaign.
 *
 * Pulls jobs from the job-board worker, keeps the ones still inside the
 * early-access window (the ones NOT yet on the public board), and creates
 * a draft campaign in MailerLite.
 *
 * This script never sends. It creates a draft and stops. Sending stays a
 * human decision made in the MailerLite UI.
 *
 * Key: MAILERLITE_API_KEY env var, else ~/.virtueasy/mailerlite.key.
 * Node 18+ (native fetch).
 *
 * Usage:
 *   node scripts/weekly-digest.mjs            # create the draft
 *   node scripts/weekly-digest.mjs --dry-run  # build + report, touch nothing
 */

import fs from 'node:fs';
import path from 'node:path';

const WORKER_URL = 'https://virtueasy-va-job-board.morgan-2bf.workers.dev/jobs';
const ML_API = 'https://connect.mailerlite.com/api';
const GROUP_ID = '185458839430104953';
const FROM = 'hello@virtueasy.com';
const FROM_NAME = 'Virtueasy';

// Must match EARLY_ACCESS_DAYS in va-job-board.html. If these drift, the
// email either repeats jobs the board already shows or skips jobs entirely.
const EARLY_ACCESS_DAYS = 7;

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Key lookup, in order: environment, then a file outside the repo.
 * Deliberately never reads the key out of the site source. A copy is
 * currently committed in va-job-board.html; that copy is public and needs
 * rotating, and nothing new should depend on it.
 */
function resolveApiKey() {
  if (process.env.MAILERLITE_API_KEY) return process.env.MAILERLITE_API_KEY.trim();
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const keyPath = path.join(home, '.virtueasy', 'mailerlite.key');
  if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, 'utf8').trim();
  return null;
}

const API_KEY = resolveApiKey();

const PINK = '#FF1F7A';
const INK = '#111111';
const MUTED = '#6b6b6b';

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

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

async function fetchJobs() {
  const res = await fetch(`${WORKER_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) die(`job feed returned HTTP ${res.status}`);
  const data = await res.json();
  const jobs = data.jobs || [];
  if (!jobs.length) die('job feed returned zero jobs - refusing to build an empty digest');
  return jobs;
}

/**
 * Keep only jobs still inside the early-access window. A job with an
 * unparseable date is EXCLUDED here (the board treats it as public), so the
 * two rules stay complementary and no job is both public and "exclusive".
 */
function selectEarlyAccess(jobs) {
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

function groupByCategory(jobs) {
  const groups = new Map();
  for (const j of jobs) {
    const cat = j.category || 'Other Remote Roles';
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

function renderEmail(jobs) {
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

function weekStamp(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function ml(path, options = {}) {
  const res = await fetch(`${ML_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(body); } catch { /* non-JSON error page */ }
  return { ok: res.ok, status: res.status, body: parsed, raw: body };
}

/** Guard against a double-run creating two identical drafts for one week. */
async function draftAlreadyExists(name) {
  const res = await ml('/campaigns?filter[status]=draft&limit=25');
  if (!res.ok) return false; // Non-fatal: worst case a duplicate draft to delete.
  return (res.body?.data || []).some(c => c.name === name);
}

async function main() {
  if (!API_KEY && !DRY_RUN) {
    die('No API key. Set MAILERLITE_API_KEY, or write the key to ~/.virtueasy/mailerlite.key');
  }

  const all = await fetchJobs();
  const jobs = selectEarlyAccess(all);

  console.log(`feed total:      ${all.length}`);
  console.log(`early-access:    ${jobs.length}  (posted within ${EARLY_ACCESS_DAYS}d)`);
  console.log(`already public:  ${all.length - jobs.length}`);

  if (!jobs.length) {
    console.log('\nNo new jobs this week. No draft created - an empty digest is worse than none.');
    return;
  }

  const name = `VA Job Digest - week of ${weekStamp()}`;
  const subject = `${jobs.length} new VA jobs (before they go public)`;
  const html = renderEmail(jobs);

  console.log(`\nname:    ${name}`);
  console.log(`subject: ${subject}`);
  console.log(`html:    ${html.length} bytes`);

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing was created.');
    return;
  }

  if (await draftAlreadyExists(name)) {
    console.log(`\nA draft named "${name}" already exists. Skipping to avoid a duplicate.`);
    return;
  }

  const res = await ml('/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      name,
      type: 'regular',
      groups: [GROUP_ID],
      emails: [{ subject, from: FROM, from_name: FROM_NAME, content: html }],
    }),
  });

  if (!res.ok) die(`MailerLite returned HTTP ${res.status}: ${res.raw.slice(0, 400)}`);

  const c = res.body.data;
  console.log(`\nDRAFT CREATED`);
  console.log(`  id:     ${c.id}`);
  console.log(`  status: ${c.status}`);
  console.log(`  review: https://dashboard.mailerlite.com/campaigns/${c.id}/edit`);
  console.log(`\nNot sent. Review it in MailerLite and send when you are happy with it.`);
}

main().catch(err => die(err.stack || err.message));
