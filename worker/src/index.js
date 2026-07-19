/**
 * virtueasy-subscribe
 *
 * Two jobs, both talking to MailerLite:
 *
 *   fetch()     POST /subscribe - adds an email from the job board to the
 *               MailerLite job-board group.
 *   scheduled() Weekly cron - builds the job digest as a MailerLite DRAFT.
 *
 * They live in one Worker on purpose. Both need the MailerLite API key, and
 * a second Worker would mean a second copy of that key - which is the exact
 * problem this Worker exists to solve. The name is narrower than what it
 * does; that is the trade for keeping the key in one place.
 *
 * The key is a Worker secret and never reaches the browser.
 *
 * Deploy:
 *   cd worker
 *   npx wrangler secret put MAILERLITE_API_KEY
 *   npx wrangler deploy
 */

import { createDigestDraft, sendReminder } from './digest.js';

const ML_SUBSCRIBERS = 'https://connect.mailerlite.com/api/subscribers';
const GROUP_ID = '185458839430104953'; // "Source: Job Board"

const ALLOWED_ORIGINS = new Set([
  'https://virtueasy.com',
  'https://www.virtueasy.com',
]);

const MAX_BODY_BYTES = 1024;
const MAX_EMAIL_LENGTH = 254; // RFC 5321

/**
 * Deliberately boring validation. This is a gate against typos and junk,
 * not a claim that the address is deliverable - only a confirmation email
 * proves that, and MailerLite handles it downstream.
 */
function isPlausibleEmail(email) {
  if (typeof email !== 'string') return false;
  if (email.length < 3 || email.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(email)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(email);
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname !== '/subscribe') {
      return json({ error: 'not_found' }, 404, origin);
    }

    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, origin);
    }

    // An Origin allowlist stops other sites using this endpoint from a
    // browser. It is not real abuse protection - anything not a browser can
    // set Origin freely. If this endpoint starts getting list-bombed, the
    // fix is a Turnstile token, not a stricter header check.
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: 'forbidden' }, 403, origin);
    }

    if (!env.MAILERLITE_API_KEY) {
      console.error('MAILERLITE_API_KEY secret is not set');
      return json({ error: 'server_misconfigured' }, 500, origin);
    }

    let payload;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) {
        return json({ error: 'payload_too_large' }, 413, origin);
      }
      payload = JSON.parse(raw);
    } catch {
      return json({ error: 'invalid_json' }, 400, origin);
    }

    const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!isPlausibleEmail(email)) {
      return json({ error: 'invalid_email' }, 400, origin);
    }

    let mlResponse;
    try {
      mlResponse = await fetch(ML_SUBSCRIBERS, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.MAILERLITE_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, groups: [GROUP_ID] }),
      });
    } catch (err) {
      console.error('MailerLite request failed:', err.message);
      return json({ error: 'upstream_unavailable' }, 502, origin);
    }

    if (!mlResponse.ok) {
      // Log upstream detail for debugging, return none of it. The response
      // body can echo account state, and this endpoint is public.
      console.error(`MailerLite HTTP ${mlResponse.status}: ${(await mlResponse.text()).slice(0, 300)}`);
      // 422 means MailerLite rejected the address itself; that is the
      // caller's problem to fix, not a server fault.
      const status = mlResponse.status === 422 ? 400 : 502;
      return json({ error: status === 400 ? 'invalid_email' : 'upstream_error' }, status, origin);
    }

    return json({ ok: true }, 200, origin);
  },

  /**
   * Weekly digest. Creates a DRAFT campaign and stops.
   *
   * This handler must never send or schedule the campaign. Morgan reviews
   * the draft in MailerLite and sends it herself - an automated blast to a
   * real subscriber list cannot be recalled if a run goes wrong.
   */
  async scheduled(event, env, ctx) {
    if (!env.MAILERLITE_API_KEY) {
      console.error('digest: MAILERLITE_API_KEY secret is not set');
      return;
    }

    ctx.waitUntil((async () => {
      let result;
      try {
        result = await createDigestDraft(env.MAILERLITE_API_KEY, env.JOBS);
        if (result.status === 'created') {
          console.log(`digest: created draft ${result.id} with ${result.count} jobs - ${result.reviewUrl}`);
        } else {
          console.log(`digest: skipped - ${result.reason}`);
        }
      } catch (err) {
        // Surfaces in `wrangler tail` and Workers logs. A failed week means
        // no draft, which is visible by absence rather than a broken send.
        console.error(`digest: failed - ${err.message}`);
        result = { status: 'failed', error: err.message };
      }

      // Reminder is best-effort and reported separately. A dead Resend key
      // must not make a successful digest look like a failed one.
      try {
        const r = await sendReminder(env, result);
        console.log(`reminder: ${r.skipped ? 'skipped - ' + r.skipped : 'sent to ' + r.to}`);
      } catch (err) {
        console.error(`reminder: failed - ${err.message}`);
      }
    })());
  },
};
