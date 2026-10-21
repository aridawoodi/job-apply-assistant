// Loads the real unpacked extension in Chromium and drives it end to end.
const { chromium } = require('playwright');
const fs = require('fs');
const EXT = '/workspace/job-apply-extension';
(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-profile-' + Date.now(), {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = sw.url().split('/')[2];
  console.log('service worker up:', sw.url());

  // Options page renders + import sample profile through the real file input
  const opt = await ctx.newPage();
  opt.on('pageerror', e => console.log('OPTIONS PAGE ERROR', e.message));
  await opt.goto(`chrome-extension://${extId}/options/options.html`);
  await opt.setInputFiles('#import', `${EXT}/dev-tests/fixtures/test-profile.json`);
  await opt.waitForTimeout(500);
  console.log('options: first name field =', await opt.inputValue('[data-path="firstName"]'), '| bank rows =', await opt.locator('#bankRows tr').count());
  // resume (v0.4+ imports resumes through the setup wizard; here a tiny fake PDF is stored directly)
  await sw.evaluate(async () => chrome.storage.local.set({ resume: { name: 'Alex_Morgan_Resume.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,' + btoa('%PDF-1.4\n%%EOF\n'), size: 15 } }));
  await opt.click('#test');
  await opt.waitForFunction(() => !/Testing/.test(document.getElementById('testOut').textContent), null, { timeout: 15000 });
  console.log('options: Test connection ->', JSON.stringify(await opt.textContent('#testOut')));

  // Live Greenhouse page: the content script should add the floating button
  const page = await ctx.newPage();
  page.on('console', m => { if (/Job Apply/.test(m.text())) console.log('PAGE:', m.text()); });
  const url = process.argv[2] || 'https://job-boards.greenhouse.io/anthropic/jobs/5456619008';
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000); await page.waitForSelector('#jaa-host', { state: 'attached', timeout: 30000 });
  console.log('floating button injected on', url);
  await page.locator('#jaa-host button.btn').click();
  await page.waitForFunction(() => { const h = document.getElementById('jaa-host'); const p = h && h.shadowRoot.querySelector('.panel.open'); return p && p.querySelector('.stats, .err') && !/⏳|Loading local model/.test(p.innerText); }, null, { timeout: 240000 });
  await page.waitForTimeout(1000);
  const panelText = await page.evaluate(() => document.getElementById('jaa-host').shadowRoot.querySelector('.panel').innerText);
  console.log('PANEL:\n' + panelText.split('\n').slice(0, 12).join('\n'));
  console.log('highlights: green=%d blue=%d yellow=%d', ...(await page.evaluate(() => ['.jaa-ok', '.jaa-ai', '.jaa-todo'].map(s => document.querySelectorAll(s).length))));
  console.log('resume chip shown:', await page.evaluate(() => /Alex_Morgan_Resume\.pdf/.test(document.body.innerText)));
  console.log('url unchanged:', page.url() === url);
  const shot = '/workspace/job-apply-extension/dev-tests/screenshots/live-' + new URL(url).hostname.split('.').slice(-2, -1)[0] + '.png';
  await page.waitForTimeout(1500); await page.screenshot({ path: shot }); console.log('screenshot:', shot);
  console.log('chat (last lines):', JSON.stringify(panelText.split('\n').slice(-8).join(' | ')));

  // Tracker entry written by the background worker
  const apps = await sw.evaluate(async () => (await chrome.storage.local.get('applications')).applications);
  console.log('tracker:', JSON.stringify(apps));
  await opt.goto(`chrome-extension://${extId}/options/options.html#tracker`);
  console.log('tracker rows in options:', await opt.locator('#appRows tr').count());
  const [dl] = await Promise.all([opt.waitForEvent('download'), opt.click('#csv')]);
  const csvPath = '/workspace/jaa-tests/tracker.csv'; await dl.saveAs(csvPath);
  console.log('CSV:\n' + fs.readFileSync(csvPath, 'utf8'));

  // Popup renders
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${extId}/popup/popup.html`);
  await pop.waitForTimeout(1500);
  console.log('popup text:', JSON.stringify((await pop.innerText('body')).replace(/\s+/g, ' ')));
  await ctx.close();
})().catch(e => { console.error('E2E FAILED', e); process.exit(1); });
