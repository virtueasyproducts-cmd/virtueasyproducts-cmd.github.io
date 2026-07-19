#!/usr/bin/env node
/**
 * Weekly VA job digest - manual runner.
 *
 * The digest normally runs on a Cloudflare cron (see worker/src/index.js).
 * This script exists for running it by hand or previewing what a run would
 * produce, and shares its logic with the Worker via worker/src/digest.js so
 * both build identical emails.
 *
 * Never sends. Creates a draft and stops.
 *
 * Key: MAILERLITE_API_KEY env var, else ~/.virtueasy/mailerlite.key.
 * (The scheduled run does not use either - it reads the Worker secret.)
 *
 * Usage:
 *   node scripts/weekly-digest.mjs            # create the draft
 *   node scripts/weekly-digest.mjs --dry-run  # build + report, touch nothing
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  fetchJobs,
  selectEarlyAccess,
  renderEmail,
  campaignName,
  createDigestDraft,
  EARLY_ACCESS_DAYS,
} from '../worker/src/digest.js';

const DRY_RUN = process.argv.includes('--dry-run');

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function resolveApiKey() {
  if (process.env.MAILERLITE_API_KEY) return process.env.MAILERLITE_API_KEY.trim();
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const keyPath = path.join(home, '.virtueasy', 'mailerlite.key');
  if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, 'utf8').trim();
  return null;
}

async function main() {
  const apiKey = resolveApiKey();
  if (!apiKey && !DRY_RUN) {
    die('No API key. Set MAILERLITE_API_KEY, or write the key to ~/.virtueasy/mailerlite.key');
  }

  if (DRY_RUN) {
    const all = await fetchJobs();
    const jobs = selectEarlyAccess(all);
    console.log(`feed total:      ${all.length}`);
    console.log(`early-access:    ${jobs.length}  (posted within ${EARLY_ACCESS_DAYS}d)`);
    console.log(`already public:  ${all.length - jobs.length}`);
    console.log(`\nname:    ${campaignName()}`);
    console.log(`subject: ${jobs.length} new VA jobs (before they go public)`);
    console.log(`html:    ${jobs.length ? renderEmail(jobs).length : 0} bytes`);
    console.log('\n--dry-run: nothing was created.');
    return;
  }

  const result = await createDigestDraft(apiKey);

  if (result.status === 'skipped') {
    console.log(`Skipped: ${result.reason}`);
    return;
  }

  console.log(`feed total:      ${result.total}`);
  console.log(`early-access:    ${result.count}`);
  console.log(`\nDRAFT CREATED`);
  console.log(`  id:     ${result.id}`);
  console.log(`  name:   ${result.name}`);
  console.log(`  review: ${result.reviewUrl}`);
  console.log(`\nNot sent. Review it in MailerLite and send when you are happy with it.`);
}

main().catch(err => die(err.stack || err.message));
