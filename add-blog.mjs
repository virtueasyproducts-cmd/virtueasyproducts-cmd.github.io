/*
 * add-blog.mjs — Virtueasy blog publish injector (mechanical half of the AIOS
 * assisted-publish routine). Clones an existing post file as the skeleton so the
 * <head>, inline <style>, nav, CTA, and footer stay byte-identical, then swaps
 * only the content regions (title/meta/og, .post-hero, <article>). Also injects
 * a matching card at the top of blog/index.html's #post-grid.
 *
 * The home page ("From the Blog") is updated automatically by the repo's
 * sync-blog-home Action on push to blog/** — nothing to do here.
 *
 * Usage:
 *   node add-blog.mjs <manifest.json> [--dry]
 *
 * Manifest = JSON array of posts. Each post:
 *   {
 *     "slug": "what-goes-in-a-va-contract",
 *     "title": "What Goes in a VA Contract (and What Happens Without One)",
 *     "tag": "Onboarding",                 // MUST be one of the filter tags (see TAGS)
 *     "metaCategory": "Contracts & Scope", // middle label in the post-meta line
 *     "metaDescription": "A VA contract protects both sides...",
 *     "read": "7 min read",
 *     "intro": "You hired a virtual assistant. Things started well...",  // post-intro (lead)
 *     "excerpt": "The clauses that actually matter...",  // index card blurb (~150 chars)
 *     "bodyHtml": "<p>...</p>\n<h2>...</h2><p>...</p>"    // inner of <article> (no video)
 *   }
 *
 * bodyHtml is trusted HTML (built by the routine). Text fields are auto-escaped.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const POSTS_DIR = path.join(ROOT, 'blog', 'posts');
const INDEX = path.join(ROOT, 'blog', 'index.html');
const TEMPLATE = path.join(POSTS_DIR, 'how-to-handle-scope-creep.html');

// Filter tags that exist in blog/index.html — a post's tag MUST be one of these
// or it won't be reachable through the on-page filters.
const TAGS = new Set([
  'Pricing', 'Finding Clients', 'Niche Selection', 'Tools', 'AI for VAs',
  'Onboarding', 'Proposals', 'Services', 'Objections', 'Discovery Calls',
  'Outreach', 'Getting Started',
]);

function die(msg) { console.error('ERROR: ' + msg); process.exit(1); }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const manifestPath = process.argv[2];
const dry = process.argv.includes('--dry');
if (!manifestPath) die('usage: node add-blog.mjs <manifest.json> [--dry]');

const posts = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(posts)) die('manifest must be a JSON array of posts');

const template = fs.readFileSync(TEMPLATE, 'utf8');
let index = fs.readFileSync(INDEX, 'utf8');
const gridAnchor = '<div class="grid" id="post-grid">';
if (!index.includes(gridAnchor)) die('could not find #post-grid anchor in blog/index.html');

const added = [];
for (const p of posts) {
  for (const k of ['slug', 'title', 'tag', 'metaCategory', 'metaDescription', 'read', 'intro', 'excerpt', 'bodyHtml'])
    if (!p[k]) die(`post "${p.slug || p.title || '?'}" missing required field: ${k}`);
  if (!TAGS.has(p.tag)) die(`post "${p.slug}" tag "${p.tag}" is not a filter tag (use one of: ${[...TAGS].join(', ')})`);

  const dest = path.join(POSTS_DIR, p.slug + '.html');
  if (fs.existsSync(dest)) { console.log(`  skip (exists): ${p.slug}`); continue; }
  if (index.includes(`posts/${p.slug}.html`)) { console.log(`  skip (card exists): ${p.slug}`); continue; }

  const titleTag = `${esc(p.title)} | Virtueasy`;

  // --- build the new post file from the template skeleton ---
  let html = template;

  // 1. <title>
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${titleTag}</title>`);
  // 2. meta description
  html = html.replace(/<meta name="description" content="[\s\S]*?"\s*\/>/,
    `<meta name="description" content="${esc(p.metaDescription)}" />`);
  // 3. og:title
  html = html.replace(/<meta property="og:title" content="[\s\S]*?"\s*\/>/,
    `<meta property="og:title" content="${titleTag}" />`);
  // 4. og:description
  html = html.replace(/<meta property="og:description" content="[\s\S]*?"\s*\/>/,
    `<meta property="og:description" content="${esc(p.metaDescription)}" />`);

  // 5. .post-hero block (span.post-tag, h1, post-meta, post-intro)
  const hero =
`<div class="post-hero">
  <span class="post-tag">${esc(p.tag)}</span>
  <h1>${esc(p.title)}</h1>
  <p class="post-meta">Virtueasy <span>&#183;</span> ${esc(p.metaCategory)} <span>&#183;</span> ${esc(p.read)}</p>
  <p class="post-intro">${esc(p.intro)}</p>
</div>`;
  if (!/<div class="post-hero">[\s\S]*?<\/div>\s*<article>/.test(html))
    die(`template hero/article boundary not found (post "${p.slug}")`);
  html = html.replace(/<div class="post-hero">[\s\S]*?<\/div>\s*<article>/, hero + '\n\n<article>');

  // 6. <article> body (drops the template's video-embed + old copy)
  html = html.replace(/<article>[\s\S]*?<\/article>/,
    `<article>\n\n${p.bodyHtml.trim()}\n\n</article>`);

  // --- build the index card (inserted at top of the grid) ---
  const card =
`
  <a href="posts/${p.slug}.html" class="card" data-tag="${esc(p.tag)}">
    <div class="card-inner">
      <span class="card-tag">${esc(p.tag)}</span>
      <h2>${esc(p.title)}</h2>
      <p>${esc(p.excerpt)}</p>
      <div class="card-footer"><span class="card-read">${esc(p.read)}</span><span class="card-arrow">&rarr;</span></div>
    </div>
  </a>
`;
  index = index.replace(gridAnchor, gridAnchor + card);

  if (!dry) fs.writeFileSync(dest, html);
  added.push({ slug: p.slug, url: `https://virtueasy.com/blog/posts/${p.slug}.html` });
  console.log(`  + ${p.slug}`);
}

if (!added.length) { console.log('Nothing new to add.'); process.exit(0); }
if (!dry) fs.writeFileSync(INDEX, index);

console.log(`\n${dry ? '[dry] ' : ''}Wrote ${added.length} post(s) + index card(s).`);
console.log('New URLs:');
added.forEach(a => console.log('  ' + a.url));
