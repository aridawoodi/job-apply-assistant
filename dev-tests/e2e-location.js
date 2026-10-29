// 0.6.6: Lever-style location autocomplete must pick a suggestion (blur alone clears the field).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const EXT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(__dirname, 'v5-mocks', 'lever-location.html'), 'utf8');
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-loc-' + Date.now(), {
    channel: 'chromium', headless: true, viewport: { width: 1100, height: 800 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  await ctx.route('https://jobs.lever.co/**', async route => {
    if (route.request().url().includes('/searchLocations')) return route.fulfill({ status: 404, body: '[]' });
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    return route.fulfill({ status: 200, body: 'ok' });
  });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|jobs\.lever\.co)/, r => r.fulfill({ status: 404, body: 'blocked' }));

  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('dataVersion')).dataVersion >= 5) return; await new Promise(r => setTimeout(r, 50)); } });
  for (const p of ctx.pages()) if (/welcome\.html/.test(p.url())) await p.close();
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({
      profile: { firstName: 'Jordan', lastName: 'Rivera', email: 'jordan.rivera@example.com', phone: '(555) 010-0142',
        city: 'Springfield', state: 'IL', location: 'Springfield, IL', willingToRelocate: 'Open to discussing',
        workAuthorizedUS: 'Yes', needsSponsorship: 'No' },
      onboarding: { done: true }, uiPrefs: { privacySeen: true },
      settings: Object.assign({}, settings, { useLLM: false, warmUp: false })
    });
  });

  const p = await ctx.newPage();
  await p.goto('https://jobs.lever.co/examplelabs/loc-test/apply', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#location-input', { timeout: 10000 });
  await p.waitForSelector('#jaa-host button.btn', { timeout: 20000 });

  await p.evaluate(() => {
    const el = document.getElementById('location-input');
    el.focus(); el.value = 'Springfield, IL';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
  });
  await sleep(400);
  await p.evaluate(() => document.getElementById('location-input').blur());
  await sleep(200);
  const cleared = await p.evaluate(() => ({ v: document.getElementById('location-input').value, s: document.getElementById('selected-location').value }));
  check(!cleared.v && !cleared.s, 'control: blur without a pick clears Lever location (reproduces the bug)');

  await p.locator('#jaa-host button.btn').click();
  await p.waitForFunction(() => {
    const h = document.getElementById('jaa-host'); const b = h && h.shadowRoot.querySelector('.body');
    return b && /Required \d+ of \d+|filled|need you/i.test(b.innerText) && !h.shadowRoot.querySelector('.prog');
  }, null, { timeout: 60000 }).catch(() => {});
  await sleep(800);

  const after = await p.evaluate(() => ({
    v: document.getElementById('location-input').value,
    s: document.getElementById('selected-location').value,
    name: document.getElementById('name').value,
    body: document.getElementById('jaa-host').shadowRoot.querySelector('.body').innerText.slice(0, 900)
  }));
  check(/Springfield/i.test(after.v), 'location input kept a Springfield suggestion: ' + after.v);
  check(!!after.s && /Springfield/i.test(after.s), 'selected-location JSON set: ' + String(after.s).slice(0, 100));
  check(after.name === 'Jordan Rivera', 'name filled from profile');
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
  await ctx.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
