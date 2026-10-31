#!/usr/bin/env node
// Pre-release checks (no dependencies): JS syntax, manifest, no remote code, no personal data.
// Usage: node scripts/lint.js            (optional: JAA_PRIVATE_PATTERNS=/path/to/patterns.txt, one regex per line)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SKIP = /^(node_modules|dist|\.git|dev-tests\/node_modules)(\/|$)/;
let problems = 0;
const fail = m => { console.log('  ✗ ' + m); problems++; };
const ok = m => console.log('  ✓ ' + m);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name).replace(/\\/g, '/');
    if (SKIP.test(rel)) continue;
    if (e.isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
}
const all = walk('.').map(f => f.replace(/^\.\//, ''));
const shipped = all.filter(f => !/^(dev-tests|scripts|store|store-assets|\.github|docs|site)\//.test(f) && !/\.(md)$/.test(f) && f !== 'LICENSE' && !/^\./.test(f));
const ours = shipped.filter(f => !f.startsWith('lib/vendor/'));

console.log('JavaScript syntax');
const js = all.filter(f => f.endsWith('.js') && !f.startsWith('lib/vendor/'));
let bad = 0;
for (const f of js) { try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); } catch (e) { bad++; fail(f + ': ' + String(e.stderr).split('\n').slice(0, 3).join(' ')); } }
if (!bad) ok(js.length + ' files parse');

console.log('manifest');
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const exists = f => fs.existsSync(path.join(ROOT, f));
const refs = [m.background.service_worker, m.action.default_popup, m.options_ui.page, ...Object.values(m.icons), ...Object.values(m.action.default_icon), ...m.content_scripts.flatMap(c => c.js)];
const missing = refs.filter(f => !exists(f));
missing.length ? fail('missing files: ' + missing.join(', ')) : ok(refs.length + ' referenced files exist');
m.manifest_version === 3 ? ok('Manifest V3') : fail('not MV3');
m.description.length <= 132 ? ok('description ' + m.description.length + '/132 chars') : fail('description too long: ' + m.description.length);
// permissions: required hosts stay the built-in job sites + the local AI (a new required host would make
// Chrome disable the extension for current users until they accept); any other site is optional, per site
const REQUIRED_HOSTS = ['http://127.0.0.1/*', 'http://localhost/*', 'https://*.greenhouse.io/*', 'https://jobs.lever.co/*', 'https://jobs.ashbyhq.com/*', 'https://*.myworkdayjobs.com/*', 'https://*.myworkday.com/*', 'https://*.myworkdaysite.com/*', 'https://www.linkedin.com/*'];
JSON.stringify(m.host_permissions) === JSON.stringify(REQUIRED_HOSTS) ? ok('required host permissions unchanged (' + REQUIRED_HOSTS.length + ')') : fail('required host_permissions changed: ' + JSON.stringify(m.host_permissions));
!JSON.stringify(m.host_permissions || []).includes('<all_urls>') && !(m.host_permissions || []).some(h => /^(\*|https?):\/\/\*\//.test(h)) ? ok('no broad required host access') : fail('broad required host access');
JSON.stringify(m.optional_host_permissions || []) === JSON.stringify(['https://*/*', 'http://*/*']) ? ok('optional host permissions: any site, granted per site by the user') : fail('unexpected optional_host_permissions: ' + JSON.stringify(m.optional_host_permissions));
JSON.stringify(m.permissions) === JSON.stringify(['storage', 'unlimitedStorage', 'activeTab', 'scripting', 'declarativeNetRequestWithHostAccess', 'system.memory']) ? ok('API permissions unchanged') : fail('API permissions changed: ' + JSON.stringify(m.permissions));
const defaults = fs.readFileSync(path.join(ROOT, 'lib/defaults.js'), 'utf8');
defaults.includes(`VERSION: '${m.version}'`) ? ok('version ' + m.version + ' matches lib/defaults.js') : fail('lib/defaults.js VERSION differs from manifest ' + m.version);
{ const cf = (defaults.match(/CONTENT_FILES = (\[[^\]]*\])/) || [])[1]; const main = m.content_scripts.find(c => c.js.includes('content/main.js'));
  cf && main && JSON.stringify(JSON.parse(cf.replace(/'/g, '"'))) === JSON.stringify(main.js) ? ok('in-page bundle: manifest = JAA.CONTENT_FILES (popup + allowed sites)') : fail('manifest content_scripts js differs from JAA.CONTENT_FILES'); }
const bgImports = (fs.readFileSync(path.join(ROOT, m.background.service_worker), 'utf8').match(/importScripts\(([^)]*)\)/g) || []).join(',').match(/'[^']+'/g) || [];
const badImp = bgImports.map(s => s.slice(1, -1)).filter(f => !exists(f));
badImp.length ? fail('importScripts missing: ' + badImp.join(', ')) : ok('importScripts targets exist');
for (const f of shipped.filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const [, src] of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:)?\/\//.test(src)) fail(`${f}: loads remote ${src}`);
    else if (!/^#/.test(src) && !exists(path.join(path.dirname(f), src))) fail(`${f}: missing ${src}`);
  }
  if (/<script(?![^>]*src=)[^>]*>\s*\S/.test(html)) fail(f + ': inline <script> (blocked by the MV3 CSP)');
  if (/\son(click|load|change|submit|input)=/i.test(html)) fail(f + ': inline event handler (blocked by the MV3 CSP)');
}
ok('HTML pages checked (no remote scripts/styles, no inline scripts)');

console.log('no remote code');
const ALLOWED_HOSTS = /^(127\.0\.0\.1|localhost|ollama\.com|schemas\.openxmlformats\.org|schemas\.microsoft\.com|www\.w3\.org|purl\.org|github\.com|chromewebstore\.google\.com|www\.linkedin\.com|linkedin\.com|jobs\.lever\.co|jobs\.ashbyhq\.com|[a-z.-]*greenhouse\.io|[a-z.-]*myworkday(jobs|site)?\.com|example\.(com|org|test))$/;
for (const f of ours.filter(f => /\.(js|html|css|json)$/.test(f))) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const [, host] of src.matchAll(/https?:\/\/(?:\*\.)?([a-zA-Z0-9.-]+[a-zA-Z0-9])/g)) if (!ALLOWED_HOSTS.test(host)) fail(`${f}: unexpected URL host ${host}`);
  if (/\beval\s*\(|new Function\s*\(|setTimeout\s*\(\s*['"`]/.test(src)) fail(f + ': eval / new Function / string timer');
  if (/importScripts\([^)]*https?:/.test(src) || /import\(\s*['"`]https?:/.test(src)) fail(f + ': loads remote code');
}
for (const f of shipped.filter(f => f.startsWith('lib/vendor/') && f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/cdnjs|unpkg\.com|jsdelivr|googleapis\.com\/ajax/.test(src)) fail(f + ': references a CDN');
}
ok('own code: only local Ollama, job sites, ollama.com download links, the store review page and XML namespaces; vendor: no CDN references');

console.log('personal data');
const shippedText = shipped.filter(f => /\.(js|html|css|json|txt)$/.test(f) && !f.startsWith('lib/vendor/'));
for (const f of shippedText.concat(all.filter(f => /^(dev-tests|store|docs|site)\//.test(f) && /\.(js|html|json|md|txt|xml)$/.test(f))).concat(['README.md', 'PRIVACY.md', 'CHANGELOG.md'])) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const [e] of src.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) if (!/@(example\.(com|org|test)|users\.noreply\.github\.com)$/i.test(e) && !/\.(png|js|css)$/.test(e)) fail(`${f}: email address ${e}`);
  for (const [p] of src.matchAll(/\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/g)) if (!/555/.test(p)) fail(`${f}: phone number ${p}`);
}
if (process.env.JAA_PRIVATE_PATTERNS && fs.existsSync(process.env.JAA_PRIVATE_PATTERNS)) {
  const pats = fs.readFileSync(process.env.JAA_PRIVATE_PATTERNS, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')).map(s => new RegExp(s, 'i'));
  const tracked = (() => { try { return execFileSync('git', ['ls-files'], { cwd: ROOT }).toString().split('\n').filter(Boolean); } catch (_) { return all; } })();
  for (const f of tracked.filter(f => !/\.(png|jpg|zip|docx|pdf)$/.test(f) && exists(f))) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const re of pats) if (re.test(src)) fail(`${f}: matches private pattern ${re}`);
  }
  ok('private patterns checked (' + pats.length + ')');
}
ok('emails are @example.com, phone numbers are 555 numbers');

console.log(problems ? `\n${problems} problem(s)` : '\nlint passed');
process.exit(problems ? 1 : 0);
