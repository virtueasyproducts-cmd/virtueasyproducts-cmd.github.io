/**
 * Builds onboarding-kit/preview.html from the real kit app.
 *
 * The preview is the actual product with four things removed: the access
 * gate, the Meta pixel, any write or read of the buyer's saved details, and
 * the ability to type. Everything else is the real thing, so the six modules
 * look and navigate exactly as they do after purchase.
 *
 * Re-run this after any change to ok-2026-access.html, or the preview drifts
 * away from what buyers actually get:
 *   node scripts/build-onboarding-preview.mjs
 */
import fs from 'fs';

const SRC = 'onboarding-kit/ok-2026-access.html';
const OUT = 'onboarding-kit/preview.html';
const BUY = 'https://buy.stripe.com/cNiaEXfqW0jS73d4AmdAk01';

let s = fs.readFileSync(SRC, 'utf8');
const startedAt = s.length;

/** Remove everything between two anchors, inclusive. Throws if not unique. */
function cut(hay, open, close, label) {
  const i = hay.indexOf(open);
  if (i < 0) throw new Error(`${label}: open anchor not found`);
  const j = hay.indexOf(close, i + open.length);
  if (j < 0) throw new Error(`${label}: close anchor not found`);
  return hay.slice(0, i) + hay.slice(j + close.length);
}

function replaceOnce(hay, find, sub, label) {
  const n = hay.split(find).length - 1;
  if (n !== 1) throw new Error(`${label}: expected 1 match, found ${n}`);
  return hay.replace(find, sub);
}

// 1. The access gate. Without this the preview redirects straight to login.
//    Anchored on the comment and widened back to its <script>, because the
//    source is CRLF and a newline inside an anchor will not match.
{
  const marker = s.indexOf('// ── AUTH');
  if (marker < 0) throw new Error('auth gate: marker not found');
  const open = s.lastIndexOf('<script>', marker);
  if (open < 0) throw new Error('auth gate: enclosing <script> not found');
  const close = s.indexOf('</script>', marker);
  if (close < 0) throw new Error('auth gate: closing </script> not found');
  s = s.slice(0, open) + s.slice(close + '</script>'.length);
}

// 2. The Meta pixel. The preview is iframed into the sales page, which already
//    fires its own PageView; leaving this in double-counts every visitor.
s = cut(s, '<!-- Meta Pixel Code -->', '<!-- End Meta Pixel Code -->', 'meta pixel');

s = replaceOnce(s,
  '<title>VA Client Onboarding Kit - Virtueasy</title>',
  '<title>VA Client Onboarding Kit - Free Preview</title>', 'title');

// 3. Never read the buyer's saved details. preview.html is same-origin with the
//    real app, so localStorage is SHARED - without this a buyer opening the
//    sales page would see their own client's name inside the public preview.
//    Feeding load() a literal object leaves its `if (saved.x)` lines intact.
s = replaceOnce(s,
  "JSON.parse(localStorage.getItem('vok_setup') || '{}')",
  'PREVIEW_SAMPLE', 'load() localStorage read');

// 4. ...and never write, either.
s = replaceOnce(s,
  "try { localStorage.setItem('vok_setup', JSON.stringify(data)); } catch(e) {}",
  '/* preview: no persistence */', 'saveSetup write');

// 5. Copying is the product. Send the button to the checkout instead.
s = replaceOnce(s, 'function copyText(id, btn) {',
  'function copyText(id, btn) {\n  window.open(PREVIEW_BUY, "_blank", "noopener");\n  return;\n  /* eslint-disable no-unreachable */', 'copyText');

const SAMPLE = `
var PREVIEW_BUY = ${JSON.stringify(BUY)};
/* Sample data so every module renders as a finished document rather than an
   empty form. Deliberately a made-up VA and a made-up client. */
/* The select values must match an <option> in ok-2026-access.html exactly,
   or the control falls back to "Select..." and the preview looks unfinished. */
var PREVIEW_SAMPLE = {
  name: 'Jamie Lane', biz: 'Lane Virtual Support',
  email: 'hello@lanevirtualsupport.com', niche: 'Social Media VA',
  rate: '800', payment: 'Stripe',
  response: 'Within 24 hours on business days', paydue: 'Due upon receipt',
  done: true
};
`;
s = replaceOnce(s, 'function v(id) {', SAMPLE + '\nfunction v(id) {', 'sample data');

// 6. Seed the per-document fields, freeze every control, and fade the long
//    outputs. Runs after the app's own DOMContentLoaded init.
const PREVIEW_JS = `
<script>
/* ---- preview behaviour: look real, navigate freely, change nothing ---- */
(function(){
  var SEED = {
    'e-client':'Sarah Whitfield', 'e-project':'Social media management',
    'e-start':'Monday, June 2', 'e-calltime':'Tuesday at 2pm EST',
    'sc-client':'Sarah Whitfield', 'sc-end':'Ongoing, 30 days notice',
    'sc-outscope':'Paid ad management, video editing',
    'c-client':'Sarah Whitfield', 'c-clientbiz':'Whitfield Wellness Co.',
    'c-date':'June 2, 2026', 'cl-client':'Sarah Whitfield'
  };

  function start(){
    Object.keys(SEED).forEach(function(id){
      var el = document.getElementById(id);
      if (el && !el.value) el.value = SEED[id];
    });

    // Pick a few scope tasks so the generated document is not empty.
    var tiles = document.querySelectorAll('.task-tile, .scope-task, [data-task]');
    for (var i = 0; i < tiles.length && i < 4; i++) {
      try { tiles[i].click(); } catch(e) {}
    }

    try { if (window.refreshAll) refreshAll(); } catch(e) {}

    // Freeze every control. Navigation stays live: .nav-item and the
    // Back/Next buttons call goTo(), which is what makes this click-through.
    document.querySelectorAll('input, textarea, select').forEach(function(el){
      el.readOnly = true;
      el.tabIndex = -1;
      if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') el.disabled = true;
    });

    document.body.classList.add('is-preview');
    fade();
  }

  // The long generated documents are the thing being sold. Show the opening
  // of each, then fade out under a buy strip.
  function fade(){
    ['email-body','intake-text','scope-doc','contract-doc'].forEach(function(id){
      var el = document.getElementById(id);
      if (!el || el.dataset.faded) return;
      var text = (el.textContent || '').trim();
      if (text.length < 260) return;          // still a placeholder, leave it
      el.dataset.faded = '1';
      el.classList.add('preview-fade');
      var bar = document.createElement('a');
      bar.className = 'preview-unlock';
      bar.href = PREVIEW_BUY;
      bar.target = '_blank';
      bar.rel = 'noopener';
      bar.setAttribute('data-rewardful', '');
      bar.innerHTML = '<span>Unlock the full document</span><b>Get the kit, $7</b>';
      el.parentNode.insertBefore(bar, el.nextSibling);
    });
  }

  // The app regenerates documents on input; re-apply after navigation.
  var _goTo = window.goTo;
  if (typeof _goTo === 'function') {
    window.goTo = function(n){ var r = _goTo.apply(this, arguments); setTimeout(fade, 0); return r; };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(start, 0); });
  } else {
    setTimeout(start, 0);
  }
})();
</script>
<style>
/* Controls read as filled-in, not as broken inputs. */
.is-preview input, .is-preview textarea, .is-preview select {
  cursor: default;
  opacity: 0.92;
}
.is-preview input:focus, .is-preview textarea:focus, .is-preview select:focus { outline: none; }
/* Anything that writes state is inert, but still visible.
   The onboarding checklist is deliberately NOT in this list. Its click
   handler only toggles a CSS class and a checkmark glyph; it touches no
   storage (vok_setup is the app's only key and the checklist never reads
   or writes it). Freezing it made eleven checkboxes that the step's own
   copy tells you to tick do nothing, which is where the dead clicks
   measured on the sales page on 2026-09-05 came from. */
.is-preview .task-tile, .is-preview .scope-task, .is-preview [data-task] {
  pointer-events: none;
}
.is-preview .copy-btn { cursor: pointer; }

.preview-fade {
  max-height: 190px;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, #000 55%, transparent 100%);
          mask-image: linear-gradient(to bottom, #000 55%, transparent 100%);
}
.preview-unlock {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  margin-top: 0.75rem; padding: 0.7rem 1rem;
  border: 1px solid rgba(255,31,122,0.35); border-radius: 8px;
  background: rgba(255,31,122,0.07); text-decoration: none;
}
.preview-unlock span {
  font-size: 0.82rem; font-weight: 600; letter-spacing: 0.02em; color: #b9b5b7;
}
.preview-unlock b {
  flex-shrink: 0; background: #FF1F7A; color: #fff;
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 0.5rem 1rem; border-radius: 4px;
}
.preview-unlock:hover b { background: #D91565; }
</style>
`;

s = replaceOnce(s, '</body>', PREVIEW_JS + '</body>', 'preview injection');

// The rest of the site is CRLF; the injected blocks above are LF. Normalise so
// the generated file does not end up with mixed endings.
s = s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

fs.writeFileSync(OUT, s);
console.log(`${OUT}: ${startedAt} -> ${s.length} bytes`);
