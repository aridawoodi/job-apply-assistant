// Shared setup for the v0.3 tests: loads the unpacked extension in Chromium, serves mock
// ATS pages for every job-site host (nothing reaches a real site), seeds the sample profile.
const { chromium } = require('playwright');
const fs = require('fs');
const EXT = '/workspace/job-apply-extension';
const SHOTS = EXT + '/dev-tests/screenshots';
const CTL = '/tmp/mock-ollama-ctl.json', LOG = '/tmp/mock-ollama-log.jsonl';
const wdPage = require('./v3-mocks/wd-page.js');
const setCtl = o => fs.writeFileSync(CTL, JSON.stringify(o));
const readLog = () => fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; return c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = f => fs.readFileSync(__dirname + '/' + f, 'utf8');

async function launch(opts) {
  opts = opts || {};
  fs.mkdirSync(SHOTS, { recursive: true });
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-v3-' + Date.now() + Math.random(), {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 860 }, reducedMotion: opts.reducedMotion || 'no-preference',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  const realHits = [];
  await ctx.route(/^https:\/\//, route => {
    const u = new URL(route.request().url());
    const ok = body => route.fulfill({ status: 200, contentType: 'text/html', body });
    if (/greenhouse\.io$/.test(u.hostname)) {
      if (u.pathname === '/mockco/jobs/400') return ok(html('v3-mocks/gh-chat.html'));
      if (u.pathname === '/mockco/jobs/300') return ok(html('v3-mocks/gh-steps.html'));
      if (/^\/mockco\/jobs\/2\d\d$/.test(u.pathname)) return ok(html('submit-mocks/gh-many.html'));
    }
    if (/myworkdayjobs\.com$/.test(u.hostname)) {
      const m = u.pathname.match(/\/apply\/step(\d)$/);
      if (m) return ok(wdPage(+m[1]));
      if (/\/apply$/.test(u.pathname)) return ok(html('v3-mocks/wd-signin.html'));
    }
    if (u.hostname === 'www.linkedin.com' && /^\/jobs\/view\/4012345678/.test(u.pathname)) return ok(html('v3-mocks/li-job.html'));
    realHits.push(u.href);
    return route.fulfill({ status: 404, body: 'blocked by test' });
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  // let the install handler (tracker migration, v0.4 migration, Origin rule) finish before seeding storage
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('dataVersion')).dataVersion >= 4) return; await new Promise(r => setTimeout(r, 50)); } });
  await new Promise(r => setTimeout(r, 200));
  const sample = JSON.parse(fs.readFileSync(EXT + '/dev-tests/fixtures/test-profile.json'));
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  await sw.evaluate(async s => chrome.storage.local.set(s), {
    profile: Object.assign({}, sample.profile, { resumeText: 'Software engineer at Northwind since 2021. Built internal Python tools and CI pipelines.', toneNotes: 'direct, warm, concrete; no buzzwords', writingSamples: 'I like building tools that quietly save people hours. At Northwind I rebuilt our release checklist into a small service.' }),
    answerBank: sample.answerBank,
    resume: { name: 'Alex_Morgan_Resume.pdf', type: 'application/pdf', size: pdf.length, dataUrl: 'data:application/pdf;base64,' + pdf.toString('base64') },
    settings: Object.assign({}, sample.settings, { llmTimeoutSec: 30, llmFirstTimeoutSec: 60 }, opts.settings || {})
  });
  const store = keys => sw.evaluate(async k => chrome.storage.local.get(k), keys);
  const setSettings = s => sw.evaluate(async s => { const st = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: Object.assign({}, st.settings, s) }); }, s);
  return { ctx, sw, extId, store, setSettings, realHits };
}
const chatText = p => p.evaluate(() => { const h = document.getElementById('jaa-host'); const b = h && h.shadowRoot.querySelector('.body'); return b ? b.innerText : ''; });
const waitChat = (p, re, ms) => p.waitForFunction(([src, fl]) => { const h = document.getElementById('jaa-host'); const b = h && h.shadowRoot.querySelector('.body'); return b && new RegExp(src, fl).test(b.innerText); }, [re.source, re.flags], { timeout: ms || 30000 });
const lastCard = p => p.locator('#jaa-host .msg.card').last();
const done = () => failures;
module.exports = { launch, check, sleep, setCtl, readLog, chatText, waitChat, lastCard, done, SHOTS, EXT };
