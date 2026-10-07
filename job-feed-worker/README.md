# virtueasy-va-job-board worker

Source of the `/jobs` feed worker (virtueasy-va-job-board.morgan-2bf.workers.dev). It was
created in the Cloudflare dashboard, so this copy was pulled from the live script on 2026-10-07.

There is no wrangler.toml on purpose: `wrangler deploy` replaces config wholesale and would drop the
dashboard bindings. Deploy with a Cloudflare API PUT to `workers/scripts/virtueasy-va-job-board`
using `keep_bindings: ["secret_text"]` and the `VA_JOBS` KV binding (fd3003a503424fdebf7f2445c51e5acd).
The cron trigger (`0 0 * * *`) lives separately and survives a script upload.

Bindings: `VA_JOBS` (KV), `RAPIDAPI_KEY` and `REFRESH_SECRET` (secrets).
