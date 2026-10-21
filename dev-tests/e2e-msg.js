const { chromium } = require('playwright');
const EXT = '/workspace/job-apply-extension';
const FILES = ['lib/defaults.js', 'content/core.js', 'content/sites.js', 'content/ui.js', 'content/learn.js', 'content/track.js', 'content/main.js'];
(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-msg-' + Date.now(), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const sample = JSON.parse(require('fs').readFileSync(EXT + '/dev-tests/fixtures/test-profile.json'));
  await sw.evaluate(async (s) => chrome.storage.local.set(s), { profile: sample.profile, answerBank: sample.answerBank, settings: Object.assign(sample.settings, { useLLM: false }) });
  // 1) supported site, message from extension (same call the popup makes)
  const p1 = await ctx.newPage();
  await p1.goto('https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd/apply'); await p1.waitForTimeout(4000);
  const r1 = await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'https://jobs.lever.co/*' }); return chrome.tabs.sendMessage(t.id, { type: 'jaa:fill' }); });
  console.log('Lever via tabs.sendMessage:', JSON.stringify({ ok: r1.ok, site: r1.site, filled: r1.filled, todo: r1.todo, company: r1.company }));
  // 2) unsupported site: popup-style injection + generic fill (local copy of a classic Greenhouse form)
  const p2 = await ctx.newPage();
  await p2.goto('http://127.0.0.1:8765/greenhouse-classic.html'); await p2.waitForTimeout(500);
  const r2 = await sw.evaluate(async (FILES) => {
    const [t] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
    let before = 'n/a';
    try { await chrome.tabs.sendMessage(t.id, { type: 'jaa:fill' }); before = 'answered'; } catch (e) { before = e.message; }
    await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => { window.__JAA_INJECTED_BY_POPUP__ = true; } });
    await chrome.scripting.executeScript({ target: { tabId: t.id }, files: FILES });
    const r = await chrome.tabs.sendMessage(t.id, { type: 'jaa:fill', generic: true });
    return { before, ok: r.ok, site: r.site, filled: r.filled, todo: r.todo };
  }, FILES);
  console.log('Generic injection path:', JSON.stringify(r2));
  console.log('submitted?', await p2.evaluate(() => !!window.__submitted));
  await ctx.close();
})();
