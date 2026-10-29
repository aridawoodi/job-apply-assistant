// Live check of the unpacked extension with REAL Ollama (qwen2.5:3b on 127.0.0.1:11434, default OLLAMA_ORIGINS,
// so the extension's declarativeNetRequest Origin rule is what makes it work). Fake person only (sample-profile.json).
// FILL ONLY: never clicks Submit/Apply/Next; every non-GET request a page makes is aborted (except Ashby's read-only
// form GraphQL); no resume is stored, so nothing is attached to any file field.
// Run: OLLAMA_MODELS=... ollama serve (default OLLAMA_ORIGINS), then `node e2e-live-real-ollama.js` (SITES='[["name","url"],...]' to pick pages).
// Writes OUT/results.json and screenshots. Postings expire: refresh the URLs from the boards' public job APIs.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const EXT = path.resolve(__dirname, '..');
const OUT = process.env.OUT || '/tmp/jaa-live-real'; // outside the repo: screenshots of real job pages
const SITES = (process.env.SITES ? JSON.parse(process.env.SITES) : [
  ['greenhouse-anthropic', 'https://job-boards.greenhouse.io/anthropic/jobs/5098025008'],
  ['greenhouse-gitlab', 'https://job-boards.greenhouse.io/gitlab/jobs/8771512002'],
  ['lever-palantir', 'https://jobs.lever.co/palantir/10dfc8bc-99ad-4ca2-ab76-853cb90a92c2/apply'],
  ['ashby-ramp', 'https://jobs.ashbyhq.com/ramp/e577622f-6657-4e53-8941-b3a774b04448/application'],
]);
fs.mkdirSync(OUT, { recursive: true });
const sample = JSON.parse(fs.readFileSync(path.join(EXT, 'sample-profile.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const blocked = [];
const results = {};

(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-live-real-' + Date.now(), {
    channel: 'chromium', headless: true, viewport: { width: 1400, height: 950 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
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
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const swErrors = [];
  sw.on('console', m => { if (m.type() === 'error') swErrors.push(m.text()); });
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('dataVersion')).dataVersion >= 5) return; await new Promise(r => setTimeout(r, 50)); } });
  for (const p of ctx.pages()) if (/welcome\.html/.test(p.url())) await p.close();

  // Chrome built-in AI + the Origin rule against real Ollama
  const env = await sw.evaluate(async () => {
    const o = { chromeVersion: navigator.userAgent.match(/Chrom(e|ium)\/[\d.]+/)?.[0] };
    o.languageModel = typeof globalThis.LanguageModel;
    if (o.languageModel !== 'undefined') { try { o.availability = await LanguageModel.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }); } catch (e) { o.availability = 'error: ' + e.message; } }
    o.rules = (await chrome.declarativeNetRequest.getDynamicRules()).map(r => ({ id: r.id, action: r.action.type, headers: (r.action.requestHeaders || []).map(h => h.header + ':' + h.operation), url: r.condition.urlFilter || r.condition.regexFilter }));
    try { const r = await fetch('http://127.0.0.1:11434/api/tags'); o.tagsStatus = r.status; o.models = (await r.json()).models.map(m => m.name); } catch (e) { o.tagsErr = e.message; }
    return o;
  });
  console.log('ENV', JSON.stringify(env));

  await sw.evaluate(async s => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ profile: s.profile, answerBank: s.answerBank || [], onboarding: { done: true }, uiPrefs: { privacySeen: true },
      settings: Object.assign({}, settings, s.settings, { useLLM: true, model: 'qwen2.5:3b', ollamaUrl: 'http://127.0.0.1:11434', llmFirstTimeoutSec: 300, llmTimeoutSec: 240 }) });
    await chrome.storage.local.remove(['resume', 'tailored']);
  }, sample);

  for (const [name, url] of SITES) {
    console.log(`\n== ${name}: ${url}`);
    const R = results[name] = { url, consoleErrors: [], pageErrors: [] };
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') { const loc = m.location() || {}; R.consoleErrors.push({ ext: /chrome-extension:/.test(loc.url || '') || /JAA|jaa/.test(m.text()), text: m.text().slice(0, 300), url: (loc.url || '').slice(0, 120) }); } });
    p.on('pageerror', e => R.pageErrors.push({ ext: /chrome-extension:/.test(e.stack || ''), text: String(e.message).slice(0, 300) }));
    try {
      await p.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(e => { R.gotoErr = e.message; });
      await sleep(4000);
      await p.evaluate(() => { window.__subs = 0; document.addEventListener('submit', () => { window.__subs++; }, true); document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button,input[type=submit],a'); if (b && /submit|apply|next/i.test(b.innerText || b.value || '') && !b.closest('#jaa-host')) window.__subs++; }, true); });
      const btn = p.locator('#jaa-host button.btn');
      R.fillButton = await btn.waitFor({ timeout: 25000 }).then(() => true).catch(() => false);
      if (!R.fillButton) { await p.screenshot({ path: `${OUT}/${name}-nobutton.png`, fullPage: true }); R.shot = `${OUT}/${name}-nobutton.png`; await p.close(); continue; }
      const urlBefore = p.url(); const t0 = Date.now();
      await btn.click();
      await p.waitForFunction(() => { const h = document.getElementById('jaa-host'); const el = h && h.shadowRoot.querySelector('.body'); return el && /Required \d+ of \d+|need you|filled/i.test(el.innerText); }, null, { timeout: 120000 }).catch(() => {});
      await p.waitForFunction(() => { const h = document.getElementById('jaa-host'); return h && !h.shadowRoot.querySelector('.prog'); }, null, { timeout: 600000 }).catch(() => { R.timeout = true; });
      R.fillSec = Math.round((Date.now() - t0) / 1000);
      await sleep(2000);
      Object.assign(R, await p.evaluate(() => {
        const host = document.getElementById('jaa-host'); const sr = host.shadowRoot;
        const lab = el => { const id = el.id; const l = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || el.closest('label') || el.closest('.field,.application-question,.form-group,[class*=Field],li,fieldset'); return ((l && l.innerText) || el.name || el.getAttribute('aria-label') || '').trim().split('\n')[0].slice(0, 80); };
        const val = el => String(el.value != null ? el.value : (el.innerText || '')).slice(0, 220);
        return {
          counts: { ok: document.querySelectorAll('.jaa-ok').length, ai: document.querySelectorAll('.jaa-ai').length, you: document.querySelectorAll('.jaa-you').length, todo: document.querySelectorAll('.jaa-todo').length },
          aiFields: Array.from(document.querySelectorAll('.jaa-ai')).map(el => ({ label: lab(el), value: val(el) })),
          okFields: Array.from(document.querySelectorAll('.jaa-ok')).slice(0, 25).map(el => ({ label: lab(el), value: val(el).slice(0, 60) })),
          todoFields: Array.from(document.querySelectorAll('.jaa-todo')).map(el => lab(el)),
          panelText: sr.querySelector('.body') ? sr.querySelector('.body').innerText.slice(0, 2500) : '',
          tabs: Array.from(sr.querySelectorAll('[role=tab], .tab, .tabs button')).map(t => t.innerText.trim()).filter(Boolean),
          whyHints: Array.from(sr.querySelectorAll('.why')).map(e => e.textContent.trim()).slice(0, 30),
          checklist: sr.querySelectorAll('.check, .checklist li, [data-check]').length
        };
      }));
      R.submitAttempts = await p.evaluate(() => window.__subs || 0);
      R.sameUrl = p.url() === urlBefore;
      R.shot = `${OUT}/${name}.png`;
      await p.screenshot({ path: R.shot });
      await p.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
      // walk the "needs you" cards with Skip only (never answers), recording each card's hint and chips
      R.cards = [];
      for (let i = 0; i < 30; i++) {
        await sleep(1200);
        const card = await p.evaluate(() => { const sr = document.getElementById('jaa-host').shadowRoot; const cs = Array.from(sr.querySelectorAll('.card')).filter(c => /NEEDS YOU/i.test(c.innerText)); const c = cs[cs.length - 1]; if (!c || c.querySelector('button:disabled')) return null; return { text: c.innerText.replace(/\n+/g, ' | ').slice(0, 400), chips: Array.from(c.querySelectorAll('.chip')).map(b => b.innerText.trim()).slice(0, 12) }; });
        if (!card) break;
        R.cards.push(card);
        if (/cover/i.test(card.text)) await p.screenshot({ path: `${OUT}/${name}-cover-card.png` });
        const skip = p.locator('#jaa-host .chip:has-text("Skip")').last();
        if (!(await skip.count())) break;
        await skip.click().catch(() => {});
      }
    } catch (e) { R.error = e.message; try { await p.screenshot({ path: `${OUT}/${name}-error.png` }); } catch (_) {} }
    console.log(JSON.stringify(R, null, 1));
    await p.close();
  }
  results._blockedNonGet = [...new Set(blocked)];
  results._swErrors = swErrors;
  results._env = env;
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
  console.log('\nBLOCKED', JSON.stringify(results._blockedNonGet), '\nSW errors', JSON.stringify(swErrors));
  await ctx.close();
})();
