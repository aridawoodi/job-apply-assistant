const { chromium } = require('playwright');
// Browser test for the v0.6.4 optional rating prompt: counting in the background worker (confirmed / marked
// Applied, once per job), the popup card (hidden before 3 days, shown after, Maybe later / Rate it) and the
// Settings footer link. Fake jobs only; every outside request is answered by the test.
// Run: node dev-tests/e2e-rating.js   (screenshots: dev-tests/screenshots/rating-*.png, or SHOTS=/dir)
const path = require('path');
const fs = require('fs');
const EXT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-rate-' + Date.now(), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>blocked by test</h1>' }));
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2]; const X = p => `chrome-extension://${id}/${p}`;
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('rating')).rating) return; await new Promise(r => setTimeout(r, 50)); } });
  let r = (await sw.evaluate(() => chrome.storage.local.get('rating'))).rating;
  check(r && r.count === 0 && r.status === 'none' && r.installedAt > Date.now() - 60000, 'install starts the clock: ' + JSON.stringify(r));
  const ev = (event, n) => sw.evaluate(([event, n]) => trackerEvent({ event, entry: { url: 'https://job-boards.greenhouse.io/examplehq/jobs/20' + n, company: 'Example Co', title: 'Engineer' } }, {}), [event, n]);
  await ev('submitted', 1); r = (await sw.evaluate(() => chrome.storage.local.get('rating'))).rating;
  check(r.count === 0, 'submitted (no confirmation yet) does not count');
  await ev('confirmed', 1); await ev('confirmed', 1);
  r = (await sw.evaluate(() => chrome.storage.local.get('rating'))).rating;
  check(r.count === 1, 'confirmed counts once per job (confirmed twice): ' + r.count);
  await ev('confirmed', 2);
  await ev('submitted', 3);
  await sw.evaluate(() => trackerUpdate({ entry: { url: 'https://job-boards.greenhouse.io/examplehq/jobs/203' }, patch: { stage: 'applied' } }));
  r = (await sw.evaluate(() => chrome.storage.local.get('rating'))).rating;
  check(r.count === 3, 'marking Applied by hand counts: ' + r.count);
  const apps = (await sw.evaluate(() => chrome.storage.local.get('applications'))).applications;
  check(apps.length === 3 && apps.every(a => a.ratingCounted), 'rows flagged so they never count twice');

  const popup = async () => { const p = await ctx.newPage(); await p.setViewportSize({ width: 320, height: 520 }); await p.goto(X('popup/popup.html')); await p.waitForTimeout(700); return p; };
  await sw.evaluate(() => chrome.storage.local.set({ onboarding: { done: true } }));
  let p = await popup();
  check(await p.locator('#rate').isHidden(), '3 applications but installed today: card hidden'); await p.close();
  await sw.evaluate(() => chrome.storage.local.get('rating').then(({ rating }) => chrome.storage.local.set({ rating: Object.assign(rating, { installedAt: Date.now() - 4 * 864e5 }) })));
  p = await popup();
  check(await p.locator('#rate').isVisible(), '3 applications + 4 days: card shown');
  check((await p.locator('#rate .rate-q').textContent()) === 'Is AI Job Application Assistant helping your search?', 'copy');
  check(await p.locator('#rateFeedback').isVisible() && await p.locator('#rateYes').isVisible(), 'Send feedback shown alongside Rate it');
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.setViewportSize({ width: 320, height: h });
  await p.screenshot({ path: path.join(SHOTS, 'rating-popup.png') });
  await p.click('#rateLater'); await p.waitForTimeout(200);
  r = (await sw.evaluate(() => chrome.storage.local.get('rating'))).rating;
  check(r.status === 'later' && r.nextAt === 13 && await p.locator('#rate').isHidden(), 'Maybe later: nextAt 13, card hidden');
  await p.close();
  await sw.evaluate(() => chrome.storage.local.get('rating').then(({ rating }) => chrome.storage.local.set({ rating: Object.assign(rating, { count: 13 }) })));
  p = await popup(); check(await p.locator('#rate').isVisible(), 'shown again after 10 more');
  const [tab] = await Promise.all([ctx.waitForEvent('page'), p.click('#rateYes')]);
  await tab.waitForLoadState().catch(() => {});
  check(/chromewebstore\.google\.com\/detail\/(.*\/)?ianfkblcpiejjcjammkdloflpjhodaen\/reviews/.test(tab.url()), 'Rate it opens ' + tab.url());
  r = (await sw.evaluate(() => chrome.storage.local.get('rating'))).rating;
  check(r.status === 'rated', 'rated');
  p = await popup(); check(await p.locator('#rate').isHidden(), 'never shown after rating'); await p.close();
  // content scripts / web pages can't answer the card
  const o = await ctx.newPage(); await o.goto(X('options/options.html')); await o.waitForTimeout(500);
  check(await o.locator('#rateLink').isVisible() && /ianfkblcpiejjcjammkdloflpjhodaen\/reviews$/.test(await o.locator('#rateLink').getAttribute('href')), 'Settings footer: Rate this extension link');
  await o.locator('footer.about').scrollIntoViewIfNeeded(); await o.screenshot({ path: path.join(SHOTS, 'rating-settings-footer.png') });
  const errs = []; ctx.on('weberror', e => errs.push(String(e.error())));
  check(errs.length === 0, 'no page errors');
  await ctx.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
