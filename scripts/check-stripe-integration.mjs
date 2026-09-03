import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootUrl = new URL('../', import.meta.url);
const root = fileURLToPath(rootUrl);
const allowedPaymentLinks = new Set([
  '5kQdRb1nJ2de3R50Qc63K07',
  '6oU3cxeav7xyaft8iE63K05',
  '9B64gB1nJaJKcnBaqM63K06',
]);
const textExtensions = new Set(['.html', '.js', '.mjs', '.toml', '.md', '.yml', '.yaml']);
const ignoredDirectories = new Set(['.git', '.wrangler', 'node_modules']);
const failures = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (textExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

for (const path of await walk(root)) {
  const name = relative(root, path).replaceAll('\\', '/');
  const source = await readFile(path, 'utf8');

  if (/[sr]k_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/.test(source)) {
    failures.push(`${name}: contains a Stripe API key or webhook secret`);
  }

  for (const match of source.matchAll(/buy\.stripe\.com\/([A-Za-z0-9]+)/g)) {
    if (!allowedPaymentLinks.has(match[1])) {
      failures.push(`${name}: contains unreviewed Stripe Payment Link ${match[1]}`);
    }
  }
}

const unlockPages = [
  'starterkit/unlock.html',
  'onboarding-kit/unlock.html',
  'pricing-tool/unlock.html',
];
for (const name of unlockPages) {
  const source = await readFile(new URL(name, rootUrl), 'utf8');
  if (!source.includes('<meta name="referrer" content="no-referrer">')) {
    failures.push(`${name}: must prevent checkout-session referrer leakage`);
  }
  if (!source.includes('history.replaceState(null, "", window.location.pathname)')) {
    failures.push(`${name}: must remove session_id from browser history`);
  }
}

const pricingApp = await readFile(new URL('pricing-tool/app.html', rootUrl), 'utf8');
if (/networkError\s*:\s*true|result\s*=\s*\{\s*valid\s*:\s*true/.test(pricingApp)) {
  failures.push('pricing-tool/app.html: access verification must fail closed');
}

if (failures.length) {
  console.error('Stripe integration checks failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Stripe integration checks passed (${allowedPaymentLinks.size} reviewed Payment Links).`);
}
