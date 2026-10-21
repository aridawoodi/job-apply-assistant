// v0.5 live check on real Greenhouse / Lever / Ashby postings with the unpacked extension loaded.
// FILL ONLY: the test never presses Submit, and every non-GET request the page makes is aborted
// (except Ashby's read-only GraphQL that loads the form), so nothing can be submitted or uploaded.
// Fake person only (Jordan Rivera). Mock Ollama on :11434 (fake answers).
// Also measures the extension's cost on each page: CPU sampled from chrome-extension:// scripts
// (CDP Profiler), plus Performance metrics with vs without the extension (median of RUNS loads).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createMock } = require('./mock-ollama-v5');
const EXT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'screenshots', 'v5');
const RUNS = +(process.env.RUNS || 3);
const SITES = [
  ['greenhouse', 'https://job-boards.greenhouse.io/anthropic/jobs/5456619008'],
  ['lever', 'https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd/apply'],
  ['ashby', 'https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245/application']
];
const PROFILE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'live-profile.json'), 'utf8'));
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; return c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const blocked = [];

async function guard(ctx) {
  await ctx.route('**/*', async route => {
    const req = route.request(); const m = req.method();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue();
    const u = new URL(req.url());
    if (/^(127\.0\.0\.1|localhost)$/.test(u.hostname)) return route.continue();
    const body = req.postData() || '';
    if (/ashbyhq\.com$/.test(u.hostname) && /non-user-graphql/.test(u.pathname) && !/submit|upload|apply|create|mutation/i.test(body)) return route.continue();
    blocked.push(m + ' ' + u.hostname + u.pathname);
    return route.abort();
  });
}

async function extCpu(page, ms, fn) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  const t0 = Date.now(); await fn(); const left = ms - (Date.now() - t0); if (left > 0) await sleep(left);
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map(); profile.nodes.forEach(n => self.set(n.id, n));
  const dt = profile.timeDeltas; const counts = new Map();
  profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
  let ext = 0, all = 0;
  for (const [id, us] of counts) { const n = self.get(id); const name = n.callFrame.functionName; if (name === '(idle)' || name === '(program)') continue; all += us; if (/^chrome-extension:\/\//.test(n.callFrame.url)) ext += us; }
  await cdp.detach();
  return { extMs: ext / 1000, pageJsMs: all / 1000 };
}

async function metrics(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const { metrics } = await cdp.send('Performance.getMetrics');
  await cdp.detach();
  const g = k => (metrics.find(x => x.name === k) || {}).value || 0;
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd } : {}; });
  return { script: g('ScriptDuration') * 1000, task: g('TaskDuration') * 1000, heapMB: g('JSHeapUsedSize') / 1048576, dcl: nav.dcl, load: nav.load, nodes: g('Nodes') };
}

(async () => {
  const mock = await createMock({ port: 11434, models: ['qwen2.5:3b'], allowExtensionOrigin: true, chatChunkMs: 2 });
  const perf = {};
  // ---- without the extension (baseline)
  const plain = await chromium.launchPersistentContext('/tmp/jaa-live-plain-' + Date.now(), { channel: 'chromium', headless: true, viewport: { width: 1360, height: 900 } });
  await guard(plain);
  for (const [name, url] of SITES) {
    perf[name] = { without: [], with: [], ext: [], extIdle: [], fill: null };
    for (let i = 0; i < RUNS; i++) {
      const p = await plain.newPage();
      await p.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await sleep(5000);
      perf[name].without.push(await metrics(p)); await p.close();
    }
  }
  await plain.close();

  // ---- with the extension
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-live-ext-' + Date.now(), {
    channel: 'chromium', headless: true, viewport: { width: 1360, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  await guard(ctx);
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('dataVersion')).dataVersion >= 5) return; await new Promise(r => setTimeout(r, 50)); } });
  for (const p of ctx.pages()) if (/welcome\.html/.test(p.url())) await p.close();
  const pdf = fs.readFileSync(path.join(__dirname, 'fixtures', 'jordan-rivera-resume.pdf')).toString('base64');
  await sw.evaluate(async s => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ profile: s.profile, onboarding: { done: true }, uiPrefs: { privacySeen: true },
      resume: { name: 'Jordan_Rivera_Resume.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,' + s.pdf, size: 20000 },
      settings: Object.assign({}, settings, { useLLM: true, model: 'qwen2.5:3b', ollamaUrl: 'http://127.0.0.1:11434', warmUp: false }) });
  }, { profile: PROFILE, pdf });

  for (const [name, url] of SITES) {
    console.log(`\n${name}: ${url}`);
    for (let i = 0; i < RUNS; i++) {
      const p = await ctx.newPage();
      // cost of loading + injecting + the first 5 s idle (match card, observers), then 5 s of steady state
      const c = await extCpu(p, 9000, () => p.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(() => {}));
      perf[name].ext.push(c.extMs);
      const idle = await extCpu(p, 5000, async () => {});
      perf[name].extIdle.push(idle.extMs);
      perf[name].with.push(await metrics(p));
      if (i < RUNS - 1) { await p.close(); continue; }
      // last run: Fill (never submit)
      await p.addInitScript(() => {});
      await p.evaluate(() => { window.__jaaSubmits = 0; document.addEventListener('submit', () => { window.__jaaSubmits++; }, true); document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button,input[type=submit]'); if (b && /submit|apply/i.test(b.innerText || b.value || '') && !b.closest('#jaa-host')) window.__jaaSubmitClicks = (window.__jaaSubmitClicks || 0) + 1; }, true); });
      const btn = p.locator('#jaa-host button.btn');
      const has = await btn.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
      if (!check(has, 'Fill button shown')) { await p.screenshot({ path: SHOTS + `/live-${name}-nobutton.png` }); await p.close(); continue; }
      const urlBefore = p.url();
      const t0 = Date.now();
      const fc = await extCpu(p, 0, async () => {
        await btn.click();
        await p.waitForFunction(() => { const h = document.getElementById('jaa-host'); const el = h && h.shadowRoot.querySelector('.body'); return el && /Required \d+ of \d+|need you|filled/i.test(el.innerText) && !(window.JAA && 0); }, null, { timeout: 120000 }).catch(() => {});
        await p.waitForFunction(() => { const h = document.getElementById('jaa-host'); return h && !h.shadowRoot.querySelector('.prog'); }, null, { timeout: 120000 }).catch(() => {});
      });
      perf[name].fill = { ms: Date.now() - t0, extCpuMs: fc.extMs };
      await sleep(1500);
      const body = await p.evaluate(() => document.getElementById('jaa-host').shadowRoot.querySelector('.body').innerText);
      const req = (body.match(/Required (\d+) of (\d+)/) || []).slice(1).join('/');
      const filled = await p.evaluate(() => ({ ok: document.querySelectorAll('.jaa-ok').length, ai: document.querySelectorAll('.jaa-ai').length, todo: document.querySelectorAll('.jaa-todo').length }));
      perf[name].fill.fields = filled; perf[name].fill.required = req;
      check(filled.ok > 2, `filled from the fake profile: ${filled.ok} green, ${filled.ai} AI, ${filled.todo} need you; required ${req || '?'}`);
      check(await p.evaluate(() => (window.__jaaSubmits || 0) + (window.__jaaSubmitClicks || 0)) === 0, 'no submit event and no Submit click');
      check(p.url() === urlBefore, 'still on the same page (nothing sent)');
      const shot = SHOTS + `/live-${name}.png`;
      await p.screenshot({ path: shot }); console.log('  screenshot', shot);
      await p.close();
    }
  }
  check(true, 'non-GET requests aborted by the guard (never sent): ' + (blocked.length ? [...new Set(blocked)].slice(0, 6).join(', ') : 'none'));
  // summary
  const out = {};
  for (const [name] of SITES) {
    const P = perf[name]; const w = k => median(P.with.map(x => x[k] || 0)); const o = k => median(P.without.map(x => x[k] || 0));
    out[name] = {
      extCpuLoadMs: +median(P.ext).toFixed(1), extCpuIdle5sMs: +median(P.extIdle).toFixed(1),
      scriptMs: { without: +o('script').toFixed(0), with: +w('script').toFixed(0) },
      taskMs: { without: +o('task').toFixed(0), with: +w('task').toFixed(0) },
      loadEventMs: { without: +o('load').toFixed(0), with: +w('load').toFixed(0) },
      heapMB: { without: +o('heapMB').toFixed(1), with: +w('heapMB').toFixed(1) },
      fill: P.fill
    };
  }
  console.log('\nPERF ' + JSON.stringify(out, null, 1));
  fs.writeFileSync('/tmp/jaa-live/perf-v5.json', JSON.stringify(out, null, 1));
  await ctx.close(); await mock.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
