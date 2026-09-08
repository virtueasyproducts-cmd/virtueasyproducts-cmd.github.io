#!/usr/bin/env node
/**
 * Weekly VA job digest - manual runner.
 *
 * The digest normally runs on a Cloudflare cron (see worker/src/index.js).
 * This script exists for running it by hand or previewing what a run would
 * produce, and shares its logic with the Worker via worker/src/digest.js so
 * both build identical emails.
 *
 * Creates a draft and stops unless --send is passed. The Monday cron sends
 * on its own; sending stays opt-in here so running this to look at something
 * cannot blast the list by accident.
 *
 * Careful: a bare run leaves a draft for the current week, and the cron
 * skips a week it has already built. So a draft made here before Monday's
 * run means no digest goes out that week until it is sent by hand or
 * deleted. The script says so after it creates one.
 *
 * Key: MAILERLITE_API_KEY env var, else ~/.virtueasy/mailerlite.key.
 * (The scheduled run does not use either - it reads the Worker secret.)
 *
 * Usage:
 *   node scripts/weekly-digest.mjs            # create the draft, do not send
 *   node scripts/weekly-digest.mjs --send     # create it and send it now
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
  createAndSendDigest,
  EARLY_ACCESS_DAYS,
} from '../worker/src/digest.js';

const DRY_RUN = process.argv.includes('--dry-run');
const SEND = process.argv.includes('--send');

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

  const result = SEND ? await createAndSendDigest(apiKey) : await createDigestDraft(apiKey);

  if (result.status === 'skipped') {
    console.log(`Skipped: ${result.reason}`);
    return;
  }

  console.log(`feed total:      ${result.total}`);
  console.log(`early-access:    ${result.count}`);
  console.log('');

  if (result.status === 'send_failed') {
    console.log(`BUILT BUT NOT SENT`);
    console.log(`  id:     ${result.id}`);
    console.log(`  name:   ${result.name}`);
    console.log(`  review: ${result.reviewUrl}`);
    die(`MailerLite refused the send: ${result.error}`);
  }

  if (result.status === 'sent') {
    console.log(`SENT`);
    console.log(`  id:     ${result.id}`);
    console.log(`  name:   ${result.name}`);
    console.log(`  to:     ${result.audience?.eligible ?? '?'} subscribers`);
    console.log(`  report: ${result.reportUrl}`);
    return;
  }

  console.log(`DRAFT CREATED`);
  console.log(`  id:     ${result.id}`);
  console.log(`  name:   ${result.name}`);
  console.log(`  review: ${result.reviewUrl}`);
  console.log('');
  console.log(`Not sent, because --send was not passed.`);
  console.log(`Heads up: the Monday cron skips a week it has already built, so`);
  console.log(`this draft suppresses the automatic send. Send it, or delete it.`);
}

main().catch(err => die(err.stack || err.message));
