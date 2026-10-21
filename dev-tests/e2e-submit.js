// Loaded-extension test for submission tracking. ALL ATS traffic is intercepted with
// Playwright routes and served from local mocks: nothing reaches the real sites.
const { chromium } = require('playwright');
const fs = require('fs');
const EXT = '/workspace/job-apply-extension';
const M = f => fs.readFileSync(__dirname + '/submit-mocks/' + f, 'utf8');
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  PASS ' : '  FAIL ') + msg); if (!cond) failures++; };

(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-sub-' + Date.now(), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  const counters = {};
  const realRequests = [];
  await ctx.route(/https:\/\/([a-z-]+\.)?(greenhouse\.io|lever\.co|ashbyhq\.com)\//, async route => {
    const req = route.request(); const u = new URL(req.url()); const k = req.method() + ' ' + u.pathname;
    counters[k] = (counters[k] || 0) + 1;
    const html = b => route.fulfill({ status: 200, contentType: 'text/html', body: b });
    if (req.method() === 'GET' && u.pathname === '/mockco/jobs/111') return html(M('gh-spa.html'));
    if (req.method() === 'GET' && u.pathname === '/mockco/jobs/112') return html(M('gh-spa.html'));
    if (req.method() === 'POST' && u.pathname === '/mockco/jobs/111') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    // 112: first submit is rejected (validation), second one succeeds
    if (req.method() === 'POST' && u.pathname === '/mockco/jobs/112') return counters[k] === 1 ? route.fulfill({ status: 422, contentType: 'application/json', body: '{"errors":["email"]}' }) : route.fulfill({ status: 200, body: '{}' });
    if (req.method() === 'GET' && u.pathname === '/mockco/jobs/113') return html(M('gh-classic.html'));
    if (req.method() === 'POST' && u.pathname === '/mockco/jobs/113') return route.fulfill({ status: 200, contentType: 'text/html', body: "<script>location.replace('/mockco/jobs/113/confirmation')</script>" });
    if (u.pathname === '/mockco/jobs/113/confirmation') return html(M('gh-confirm.html'));
    if (req.method() === 'GET' && u.pathname === '/mockco/aaaa-1111/apply') return html(M('lever-apply.html'));
    if (req.method() === 'POST' && u.pathname === '/mockco/aaaa-1111/apply') return route.fulfill({ status: 200, contentType: 'text/html', body: "<script>location.replace('/mockco/aaaa-1111/thanks')</script>" });
    if (u.pathname === '/mockco/aaaa-1111/thanks') return html(M('lever-thanks.html'));
    if (u.pathname === '/mockco/bbbb-2222/application') return html(M('ashby-app.html'));
    if (u.pathname === '/api/non-user-graphql') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{}}' });
    realRequests.push(k);
    return route.fulfill({ status: 404, body: 'blocked by test' });
  });

  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  // let the install handler (tracker migration, v0.4 migration, Origin rule) finish before seeding storage
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('dataVersion')).dataVersion >= 4) return; await new Promise(r => setTimeout(r, 50)); } });
  await new Promise(r => setTimeout(r, 200));
  const sample = JSON.parse(fs.readFileSync(EXT + '/dev-tests/fixtures/test-profile.json'));
  // v0.1.0-format tracker rows (no key / timestamps) to prove migration keeps them
  const oldRows = [
    { company: 'Mockco', title: 'Mock Engineer', url: 'https://job-boards.greenhouse.io/mockco/jobs/111', site: 'Greenhouse', status: 'Filled', date: '2026-10-18T15:00:00.000Z', firstFilled: '2026-10-18T15:00:00.000Z', filled: 3, ai: 0, todo: 1 },
    { company: 'Anthropic', title: '3P Revenue Accounting & Reporting', url: 'https://job-boards.greenhouse.io/anthropic/jobs/5456619008', site: 'Greenhouse', status: 'Interview', date: '2026-10-17T15:00:00.000Z', firstFilled: '2026-10-17T15:00:00.000Z', filled: 9, ai: 4, todo: 12 }
  ];
  await sw.evaluate(async s => chrome.storage.local.set(s), { profile: sample.profile, answerBank: sample.answerBank, settings: Object.assign({}, sample.settings, { useLLM: false }), applications: oldRows });
  const apps = () => sw.evaluate(async () => (await chrome.storage.local.get('applications')).applications);
  const row = async key => (await apps()).find(a => a.key === key);
  const waitStatus = async (key, status, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const r = await row(key); if (r && r.status === status) return r; await new Promise(r => setTimeout(r, 250)); }
    return row(key);
  };
  const badge = async page => sw.evaluate(async url => { const [t] = await chrome.tabs.query({ url }); return t ? chrome.action.getBadgeText({ tabId: t.id }) : null; }, page.url().split('?')[0] + '*');
  const toast = page => page.evaluate(() => { const h = document.getElementById('jaa-toast-host'); return h ? h.shadowRoot.querySelector('.t').innerText : ''; });
  // v0.5: a confirmed submit opens the "Application tracked ✓" modal (notes + reminder) instead of the toast
  const confirmedUi = page => page.waitForFunction(() => { const m = document.getElementById('jaa-tracked-host'); const t = document.getElementById('jaa-toast-host'); return (m && /Application tracked/.test(m.shadowRoot.querySelector('.m').innerText) && 'modal: Application tracked ✓') || (t && /confirmed/i.test(t.shadowRoot.querySelector('.t').innerText) && 'toast'); }, null, { timeout: 8000 }).then(h => h.jsonValue()).catch(() => '');

  console.log('\nA) Greenhouse SPA: Fill, then Alex submits immediately -> confirmation text');
  const a = await ctx.newPage();
  await a.goto('https://job-boards.greenhouse.io/mockco/jobs/111');
  await a.waitForSelector('#jaa-host', { state: 'attached', timeout: 15000 });
  await a.locator('#jaa-host button.btn').click();
  await a.waitForFunction(() => document.getElementById('jaa-host').shadowRoot.querySelector('.panel.open .stats'));
  let r = await row('greenhouse:mockco:111');
  check(r && r.status === 'Filled', `after Fill: status ${r && r.status}; JD's "Thank you for your interest" did not confirm`);
  await a.click('#submit'); // Alex's own trusted click, right after the fill
  r = await waitStatus('greenhouse:mockco:111', 'Applied');
  check(await a.evaluate(() => window.__submits === undefined ? 'page replaced' : window.__submits) !== 0, 'Alex\'s submit was not blocked by the autofill guard');
  check(r.status === 'Applied' && r.submittedAt && r.confirmedAt, `status=${r.status} submittedAt=${r.submittedAt} confirmedAt=${r.confirmedAt}`);
  check(r.firstFilled === '2026-10-18T15:00:00.000Z', 'old v0.1 row migrated in place (firstFilled kept, key added): ' + r.key);
  { const ui = await confirmedUi(a); check(!!ui, 'confirmation shown: ' + ui); }
  check(await badge(a) === '✓', 'toolbar badge ✓ (got ' + JSON.stringify(await badge(a)) + ')');

  console.log('\nB) Greenhouse SPA: server validation error -> Error - not sent, then fixed resubmit -> Applied');
  const b = await ctx.newPage();
  await b.goto('https://job-boards.greenhouse.io/mockco/jobs/112');
  await b.waitForSelector('#jaa-host', { state: 'attached', timeout: 15000 });
  await b.locator('#jaa-host button.btn').click();
  await b.waitForFunction(() => document.getElementById('jaa-host').shadowRoot.querySelector('.panel.open .stats'));
  await b.click('#submit');
  r = await waitStatus('greenhouse:mockco:112', 'Error - not sent');
  check(r.status === 'Error - not sent', `status=${r.status} lastError=${JSON.stringify(r.lastError)}`);
  check(/not sent/i.test(await toast(b)), 'error toast: ' + JSON.stringify(await toast(b)));
  check(await badge(b) === '!', 'badge ! (got ' + JSON.stringify(await badge(b)) + ')');
  await b.waitForTimeout(2700); // past the de-dupe window
  await b.click('#submit');
  r = await waitStatus('greenhouse:mockco:112', 'Applied');
  check(r.status === 'Applied' && r.confirmedAt, `after fixing & resubmitting: status=${r.status}`);

  console.log('\nC) Lever, submitted WITHOUT using Fill, native POST -> /thanks (navigation)');
  const c = await ctx.newPage();
  await c.goto('https://jobs.lever.co/mockco/aaaa-1111/apply');
  await c.fill('input[name=name]', 'Alex Morgan'); await c.fill('input[name=email]', 'alex.morgan@example.com');
  await c.waitForTimeout(500);
  await Promise.all([c.waitForURL('**/thanks'), c.click('button[type=submit]')]);
  r = await waitStatus('lever:mockco:aaaa-1111', 'Applied');
  check(r && r.status === 'Applied' && r.submittedAt && r.confirmedAt, `status=${r && r.status} title="${r && r.title}" company="${r && r.company}"`);
  check(r && r.title === 'Lever Role', 'title kept from the apply page, not the thanks page');
  { const ui = await confirmedUi(c); check(!!ui, 'confirmation shown on /thanks: ' + ui); }

  console.log('\nD) Ashby: Submit with required fields empty (browser blocks) -> Error; then real submit -> success text');
  const d = await ctx.newPage();
  await d.goto('https://jobs.ashbyhq.com/mockco/bbbb-2222/application');
  await d.waitForTimeout(800);
  await d.click('button[type=submit]');
  r = await waitStatus('ashby:mockco:bbbb-2222', 'Error - not sent');
  check(r && r.status === 'Error - not sent', `status=${r && r.status} lastError=${JSON.stringify(r && r.lastError)}`);
  await d.fill('#_systemfield_name', 'Alex Morgan'); await d.fill('#_systemfield_email', 'alex.morgan@example.com');
  await d.waitForTimeout(2700);
  await d.click('button[type=submit]');
  r = await waitStatus('ashby:mockco:bbbb-2222', 'Applied');
  check(r && r.status === 'Applied', `status=${r && r.status} (fetch to ApiSubmit… + "successfully submitted")`);

  console.log('\nE) Greenhouse classic native POST -> 302 /confirmation');
  const e = await ctx.newPage();
  await e.goto('https://boards.greenhouse.io/mockco/jobs/113');
  await e.fill('#first_name', 'Alex'); await e.fill('#email', 'alex.morgan@example.com');
  await Promise.all([e.waitForURL('**/confirmation'), e.click('input[type=submit]')]);
  r = await waitStatus('greenhouse:mockco:113', 'Applied');
  check(r && r.status === 'Applied' && r.title === 'Classic Role', `status=${r && r.status} title=${r && r.title}`);

  console.log('\nF) Data integrity + Options + CSV');
  const all = await apps();
  const anth = all.find(x => x.key === 'greenhouse:anthropic:5456619008');
  check(anth && anth.status === 'Interview', 'untouched old row migrated, manual status kept: ' + (anth && anth.status));
  check(all.length === 6, 'rows: ' + all.length + ' (2 old + 4 new jobs, no duplicates)');
  check(all.every(x => !/thank you/i.test(x.title) && !/\/(thanks|confirmation)$/.test(x.url)), 'titles/URLs come from the job, not the confirmation page');
  const o = await ctx.newPage();
  await o.goto(`chrome-extension://${extId}/options/options.html#tracker`);
  await o.waitForTimeout(500);
  const heads = await o.locator('table.apps th').allInnerTexts();
  check(heads.includes('Stage') && heads.includes('Submission'), 'options columns: ' + heads.filter(Boolean).slice(-4).join(' | '));
  const [dl] = await Promise.all([o.waitForEvent('download'), o.click('#csv')]);
  await dl.saveAs('/workspace/jaa-tests/tracker-v2.csv');
  const csv = fs.readFileSync('/workspace/jaa-tests/tracker-v2.csv', 'utf8');
  check(/submittedAt,confirmedAt,errorAt,lastError/.test(csv.split('\n')[0]), 'CSV header: ' + csv.split('\n')[0]);
  console.log(csv);
  await o.screenshot({ path: '/workspace/jaa-tests/options-tracker.png', fullPage: true });
  check(realRequests.every(k => k.startsWith('GET ')), 'every ATS request was intercepted locally; unknown ones (static assets) got a 404 stub, none were POSTs: ' + JSON.stringify(realRequests));
  console.log('\nrouted requests:', JSON.stringify(counters));
  await ctx.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('E2E ERROR', e); process.exit(2); });
