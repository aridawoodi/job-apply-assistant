// v0.6.7 first-run activation, end to end (fake person, fake resume, everything local):
// fresh install opens the welcome page once (never on update, never twice) -> "Import your resume" ->
// "Try it on a sample form" -> Fill on the practice page (nothing submitted) -> checklist ticks live ->
// state survives a browser restart -> popup + Options show progress -> a real fill (mock Lever page)
// -> compact popup line -> all done -> dismiss hides it for good.
// Screenshots: /workspace/activation/ (override with ACT_SHOTS).
// Run without network so a real local AI server can't interfere: unshare -rn sh -c 'ip link set lo up && node dev-tests/e2e-activation.js'
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const EXT = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures');
const SHOTS = process.env.ACT_SHOTS || '/workspace/activation';
fs.mkdirSync(SHOTS, { recursive: true });
const lever = fs.readFileSync(path.join(__dirname, 'v5-mocks', 'lever-exp.html'), 'utf8');
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; return c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DIR = '/tmp/jaa-act-' + Date.now();

async function launch() {
  const ctx = await chromium.launchPersistentContext(DIR, {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 860 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  const net = [];
  await ctx.route('https://jobs.lever.co/**', r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'text/html', body: lever }) : r.fulfill({ status: 200, body: 'ok' }));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|jobs\.lever\.co)/, r => { net.push(r.request().url()); r.fulfill({ status: 404, body: 'blocked' }); });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  return { ctx, sw, net, X: p => `chrome-extension://${id}/${p}` };
}
const welcomeTabs = ctx => ctx.pages().filter(p => /onboarding\/welcome\.html/.test(p.url()));
const actView = sw => sw.evaluate(async () => { const { activation } = await chrome.storage.local.get('activation'); return JAA.activation.view(activation); });

(async () => {
  let { ctx, sw, net, X } = await launch();

  console.log('\n1) fresh install: the welcome page opens once');
  for (let i = 0; welcomeTabs(ctx).length === 0 && i < 60; i++) await sleep(150);
  check(welcomeTabs(ctx).length === 1, 'welcome page opened on install (1 tab)');
  const wiz = welcomeTabs(ctx)[0];
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('welcomeOpenedAt')).welcomeOpenedAt) return; await new Promise(r => setTimeout(r, 50)); } });
  check(!!(await sw.evaluate(() => chrome.storage.local.get('welcomeOpenedAt'))).welcomeOpenedAt, 'remembered that it was shown (welcomeOpenedAt)');
  await sw.evaluate(() => handleInstalled({ reason: 'update', previousVersion: '0.6.6' }));
  await sleep(1200);
  check(welcomeTabs(ctx).length === 1, 'an update does not open it');
  await sw.evaluate(() => handleInstalled({ reason: 'install' }));
  await sleep(1200);
  check(welcomeTabs(ctx).length === 1, 'a repeated install event does not open a second one');
  await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: Object.assign({}, settings, { useLLM: false, warmUp: false }) }); });

  console.log('\n2) welcome: one primary action, checklist alongside');
  await wiz.bringToFront();
  await wiz.waitForSelector('#checklist .act-head', { timeout: 8000 });
  const primaries = await wiz.$$eval('[data-step=welcome] .primary', b => b.filter(x => x.offsetParent).map(x => x.textContent.trim()));
  check(primaries.length === 1 && primaries[0] === 'Import your resume', 'one visible primary button: ' + JSON.stringify(primaries));
  check(await wiz.getAttribute('#checklist', 'data-done') === '0' && /0 of 4 done/.test(await wiz.innerText('#checklist')), 'checklist: 0 of 4');
  check(!(await wiz.$('#checklist [data-act-dismiss]')), 'no dismiss button while incomplete (no hide, no nag)');
  await wiz.screenshot({ path: path.join(SHOTS, 'welcome.png') });

  console.log('\n3) Import your resume (fake PDF) -> review -> save');
  const [chooser] = await Promise.all([wiz.waitForEvent('filechooser'), wiz.click('#importBtn')]);
  await chooser.setFiles(path.join(FX, 'casey-morgan-resume.pdf'));
  await wiz.waitForSelector('#importer [data-exp-card]', { timeout: 30000 });
  await wiz.locator('#importer button', { hasText: 'Save to my profile' }).click();
  await wiz.waitForSelector('#importDone:not(.hidden)', { timeout: 10000 });
  check(/casey-morgan-resume\.pdf/.test(await wiz.innerText('#importDoneTxt')), 'saved: ' + await wiz.innerText('#importDoneTxt'));
  await wiz.waitForFunction(() => document.getElementById('checklist').dataset.done === '1', null, { timeout: 8000 });
  check(true, 'checklist ticked "Profile imported" (1 of 4)');
  await wiz.waitForSelector('#importCard.hidden', { state: 'attached', timeout: 5000 }); await sleep(700);
  check(await wiz.isVisible('#practiceBtn'), 'review collapses; "Try it on a sample form" is the next action');
  await wiz.screenshot({ path: path.join(SHOTS, 'welcome-imported.png') });

  console.log('\n4) Try it on a sample form -> Fill on the practice page');
  const [pr] = await Promise.all([ctx.waitForEvent('page'), wiz.click('#practiceBtn')]);
  await pr.waitForLoadState();
  check(/practice\/practice\.html$/.test(pr.url()), 'opens the bundled practice application: ' + pr.url().replace(/^.*\/practice/, '…/practice'));
  await pr.waitForSelector('#jaa-host .btn', { timeout: 15000 });
  const sub = await pr.innerText('#submit');
  check(/practice only/i.test(sub) && /nothing is submitted/i.test(await pr.innerText('.top')), 'clearly practice: "' + sub.replace(/\s+/g, ' ') + '", header pill says nothing is submitted');
  await pr.evaluate(() => { window.__submits = 0; document.getElementById('application-form').addEventListener('submit', () => { window.__submits++; }, true); });
  await pr.screenshot({ path: path.join(SHOTS, 'practice-before.png'), fullPage: true });
  await pr.locator('#jaa-host .btn').click();
  await pr.waitForSelector('#practiceDone:not(.hidden)', { timeout: 30000 });
  await sleep(600);
  const f = await pr.evaluate(() => Object.fromEntries(['first_name', 'last_name', 'email', 'phone', 'current_company', 'current_title', 'company-name--0', 'title--0', 'company-name--1', 'school--0', 'degree--0', 'linkedin'].map(k => [k, document.getElementById(k).value])));
  check(f.first_name === 'Casey' && f.last_name === 'Morgan' && /@example\.com$/.test(f.email), 'name + email filled: ' + f.first_name + ' ' + f.last_name + ', ' + f.email);
  check(!!f['company-name--0'] && !!f['title--0'] && !!f['company-name--1'], `work history filled: ${f['title--0']} at ${f['company-name--0']}; ${f['company-name--1']}`);
  check(!!f.current_company && !!f.current_title, `current company / title: ${f.current_title} at ${f.current_company}`);
  check(!!f['school--0'], 'education filled: ' + f['school--0'] + ' / ' + f['degree--0']);
  check(await pr.evaluate(() => window.__submits) === 0 && !(await pr.evaluate(() => document.getElementById('consent').checked)), 'nothing submitted; consent left for the user');
  await pr.evaluate(() => window.scrollTo(0, 0));
  await pr.screenshot({ path: path.join(SHOTS, 'practice-after.png'), fullPage: true });
  let v = await actView(sw);
  check(v.steps.find(s => s.id === 'practice').done && v.done === 2, 'checklist: "Practice fill done" (2 of 4)');
  check(((await sw.evaluate(() => chrome.storage.local.get('applications'))).applications || []).length === 0, 'practice fill not added to the tracker');
  await wiz.waitForFunction(() => document.getElementById('checklist').dataset.done === '2', null, { timeout: 5000 }).catch(() => {});
  check(await wiz.getAttribute('#checklist', 'data-done') === '2', 'the welcome tab updated live (2 of 4)');

  console.log('\n5) the checklist persists across a browser restart (and no welcome tab reopens)');
  await ctx.close();
  ({ ctx, sw, net, X } = await launch());
  await sleep(1500);
  check(welcomeTabs(ctx).length === 0, 'restart: welcome page not opened again');
  v = await actView(sw);
  check(v.done === 2 && v.steps.find(s => s.id === 'profile').done && v.steps.find(s => s.id === 'practice').done, 'restart: still 2 of 4 done');

  console.log('\n6) popup shows progress; each step goes to the right place');
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 340, height: 620 });
  await pop.goto(X('popup/popup.html'));
  await pop.waitForSelector('#checklist:not([hidden]) .act-head', { timeout: 8000 });
  check(/Getting started/.test(await pop.innerText('#checklist')) && /2 of 4 done/.test(await pop.innerText('#checklist')) && await pop.$('#checklist .act-ring'), 'popup: progress ring, "2 of 4 done"');
  check(await pop.$eval('#checklist .is-next', e => e.dataset.step) === 'ai', 'popup: next step highlighted = AI helper');
  check(!(await pop.$('#setup')), 'old yellow "Finish setup" banner is gone');
  await pop.screenshot({ path: path.join(SHOTS, 'popup-checklist.png'), fullPage: true });
  const goTo = async step => { const p2 = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null); await pop.evaluate(s => chrome.runtime.sendMessage({ type: 'activation:go', step: s }), step); const pg = await p2; if (pg) { await pg.waitForLoadState(); const u = pg.url(); await pg.close(); return u; } return ''; };
  check(/practice\/practice\.html/.test(await goTo('practice')), 'practice step -> practice page');
  check(/onboarding\/welcome\.html#ollama/.test(await goTo('ai')), 'AI step -> the AI helper setup');
  check(/onboarding\/welcome\.html#welcome/.test(await goTo('profile')), 'profile step -> import your resume');

  console.log('\n7) Options shows the same checklist');
  const opt = await ctx.newPage(); await opt.goto(X('options/options.html'));
  await opt.waitForSelector('#checklist:not([hidden]) .act-head', { timeout: 8000 });
  check(await opt.getAttribute('#checklist', 'data-done') === '2', 'Options: 2 of 4');
  await opt.locator('#checklist [data-act-go="ai"]').click(); await sleep(700);
  check(await opt.evaluate(() => { const r = document.getElementById('ai').getBoundingClientRect(); return r.top < 200 && r.top > -50; }), 'Options: AI step jumps to the Local AI section');
  check(/utm_source=extension&utm_medium=options_footer/.test(await opt.getAttribute('#rateLink', 'href')), 'footer store link carries utm_source=extension&utm_medium=options_footer');
  await opt.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
  await opt.screenshot({ path: path.join(SHOTS, 'options-checklist.png'), clip: { x: 0, y: 0, width: 1280, height: 520 } });

  console.log('\n8) first real application (mock job page) -> popup goes to one quiet line');
  const page = await ctx.newPage();
  await page.goto('https://jobs.lever.co/examplelabs/support-lead/apply', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#jaa-host button.btn', { timeout: 20000 });
  await page.locator('#jaa-host button.btn').click();
  await sw.evaluate(async () => { for (let i = 0; i < 200; i++) { const { activation } = await chrome.storage.local.get('activation'); if (activation && activation.realAt) return; await new Promise(r => setTimeout(r, 100)); } });
  v = await actView(sw);
  check(v.steps.find(s => s.id === 'real').done && v.done === 3 && v.compact, 'real fill ticked "First application filled" (3 of 4)');
  await pop.reload(); await pop.waitForSelector('#checklist:not([hidden])');
  check(await pop.$('#checklist .act-line') && !(await pop.$('#checklist .act-list')), 'popup: compact one-liner: ' + (await pop.innerText('#checklist')).trim());

  console.log('\n9) all done -> "You\'re all set" -> dismiss hides it everywhere, for good');
  await sw.evaluate(() => chrome.runtime.sendMessage ? activationSet(s => JAA.activation.mark(s, 'ai')) : null);
  await pop.reload(); await pop.waitForSelector('#checklist [data-act-dismiss]');
  check(/You.re all set/.test(await pop.innerText('#checklist')), 'complete: "You\'re all set" with a hide button');
  await pop.click('#checklist [data-act-dismiss]'); await sleep(400);
  check(await pop.$eval('#checklist', e => e.hidden), 'hidden after dismiss');
  await opt.reload(); await sleep(800);
  check(await opt.$eval('#checklist', e => e.hidden), 'Options: hidden too');
  await pop.reload(); await sleep(600);
  check(await pop.$eval('#checklist', e => e.hidden), 'stays hidden');
  const st = await sw.evaluate(() => chrome.storage.local.get('activation'));
  check(Object.keys(st.activation).every(k => /At$/.test(k)), 'stored state is timestamps only: ' + Object.keys(st.activation).join(', '));
  check(net.length === 0, 'no request left the computer: ' + net.slice(0, 3).join(', '));

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
  await ctx.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
