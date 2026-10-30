// 0.6.6 work experience, end to end (fake person, fake 4-job resume):
// import -> review shows 4 cards ("4 jobs found") -> save -> Options shows the same 4 -> un-tick
// "I currently work here" on the main job -> saved automatically and still there after reload -> a stale
// second Options tab can't undo it -> Fill on a Lever form uses the job that is still current.
// Screenshots: /workspace/exp-fix/ (review screen, profile editor).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const EXT = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures');
const SHOTS = process.env.EXP_SHOTS || '/workspace/exp-fix';
fs.mkdirSync(SHOTS, { recursive: true });
const lever = fs.readFileSync(path.join(__dirname, 'v5-mocks', 'lever-exp.html'), 'utf8');
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; return c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-exp-' + Date.now(), {
    channel: 'chromium', headless: true, viewport: { width: 1180, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  await ctx.route('https://jobs.lever.co/**', r => r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'text/html', body: lever }) : r.fulfill({ status: 200, body: 'ok' }));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|jobs\.lever\.co)/, r => r.fulfill({ status: 404, body: 'blocked' }));
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  const X = p => `chrome-extension://${id}/${p}`;
  const store = async () => (await sw.evaluate(() => chrome.storage.local.get('profile'))).profile;
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('dataVersion')).dataVersion >= 5) return; await new Promise(r => setTimeout(r, 50)); } });
  for (const p of ctx.pages()) if (/welcome\.html/.test(p.url())) await p.close();
  // an older profile: one job typed into the old single "Current job" fields
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ onboarding: { done: true }, uiPrefs: { privacySeen: true }, settings: Object.assign({}, settings, { useLLM: false, warmUp: false }),
      profile: { firstName: 'Casey', lastName: 'Morgan', email: 'casey.morgan@example.com', currentEmployer: 'Old Co', currentTitle: 'Old Title', workHistory: [] } });
  });

  console.log('\n1) migration: the old single "Current job" is kept as a list entry');
  const stale = await ctx.newPage(); await stale.goto(X('options/options.html#profile'));
  await stale.waitForSelector('#jobsBox [data-exp-card]');
  let p = await store();
  check(p.workHistory.length === 1 && p.workHistory[0].company === 'Old Co' && p.workHistory[0].current && p.legacyCurrent && p.legacyCurrent.employer === 'Old Co', 'Old Co became a current job card; old values kept in legacyCurrent');
  await stale.fill('[data-path="phone"]', '(555) 010-0177'); // unsaved edit in a tab that stays open (the old bug's trigger)

  console.log('\n2) import a 4-job resume: the review shows every job');
  const opt = await ctx.newPage(); await opt.goto(X('options/options.html#resume'));
  await opt.evaluate(() => { document.getElementById('importAI').checked = false; });
  await opt.setInputFiles('#importer input[type=file]', path.join(FX, 'casey-morgan-resume.pdf'));
  await opt.waitForSelector('#importer [data-exp-card]', { timeout: 20000 });
  const rev = await opt.evaluate(() => ({
    n: document.querySelectorAll('#importer [data-exp-card]').length,
    count: document.querySelector('#importer [data-exp-count]').textContent,
    now: document.querySelector('#importer [data-exp-current]').textContent,
    current: [...document.querySelectorAll('#importer [data-exp-card]')].map(c => c.querySelector('[data-f=current]').checked),
    titles: [...document.querySelectorAll('#importer [data-exp-card] [data-f=title]')].map(i => i.value),
    checks: [...document.querySelectorAll('#importer [data-exp-card] .exp-check:not(.hidden)')].map(b => b.closest('.exp-field').dataset.field),
    endDisabled: document.querySelector('#importer [data-exp-card] [data-f=endYear]').disabled
  }));
  check(rev.n === 4 && /4 jobs found/.test(rev.count), `review: ${rev.n} cards, "${rev.count}"`);
  check(rev.current.join() === 'true,true,false,false', 'current toggles: ' + rev.current.join(', ') + ' (Harbor Cloud with "current" in a bullet is not current)');
  check(rev.endDisabled, 'a current job\'s end date is disabled (Present)');
  check(rev.checks.includes('end'), '"Check this" on the start-year-only job\'s end date');
  check(/Senior Support Engineer at Bluefin Devices/.test(rev.now), 'says which job forms use as current: ' + rev.now);
  const scrollTo = sel => opt.evaluate(s => { const el = document.querySelector(s); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 110); }, sel);
  const unstick = () => opt.addStyleTag({ content: 'nav,.accent-bar{position:static!important}' });
  await scrollTo('#importer [data-exp-review]');
  await opt.screenshot({ path: path.join(SHOTS, 'review-screen.png'), fullPage: false });
  await unstick();
  await opt.locator('#importer [data-exp-review]').screenshot({ path: path.join(SHOTS, 'review-experience-cards.png') });
  // reorder with the keyboard and back, remove + undo: the count follows
  await opt.locator('#importer [data-exp-card] >> nth=1').locator('[data-f=title]').focus();
  await opt.keyboard.press('Alt+ArrowUp');
  let order = await opt.$$eval('#importer [data-exp-card] [data-f=company]', x => x.map(i => i.value));
  check(order[0] === 'Lakeview Code Club', 'Alt+↑ moves a card up: ' + order.join(' > '));
  await opt.locator('#importer [data-exp-card] >> nth=0').locator('[data-move=down]').click();
  order = await opt.$$eval('#importer [data-exp-card] [data-f=company]', x => x.map(i => i.value));
  check(order[0] === 'Bluefin Devices', '↓ button moves it back');
  await opt.locator('#importer [data-exp-card] >> nth=3').locator('[data-exp-remove]').click();
  check(/4 jobs found · 3 to save/.test(await opt.textContent('#importer [data-exp-count]')), 'remove: "4 jobs found · 3 to save"');
  await opt.click('#importer [data-exp-undo]');
  check(await opt.$$eval('#importer [data-exp-card]', x => x.length) === 4, 'Undo brings the job back');
  // gentle validation
  const t2 = opt.locator('#importer [data-exp-card] >> nth=2');
  await t2.locator('[data-f=startYear]').fill('2022');
  check(/before the start/.test(await t2.locator('[data-field=end] .exp-msg').textContent()), 'end before start is pointed out');
  await t2.locator('[data-f=startYear]').fill('2019');
  check(!/before the start/.test(await t2.locator('[data-field=end] .exp-msg').textContent()), '...and the hint goes away when fixed');
  await opt.locator('#importer button', { hasText: 'Save to my profile' }).click();
  await opt.waitForFunction(() => /is now your master resume/.test(document.getElementById('importer').innerText));

  console.log('\n3) saved = shown; Options profile shows the same jobs');
  p = await store();
  check(p.workHistory.length === 4 && p.workHistory.map(j => j.company).join() === 'Bluefin Devices,Lakeview Code Club,Harbor Cloud,Riverside Clinic', 'stored 4 jobs in the order shown: ' + p.workHistory.map(j => j.company).join(', '));
  check(p.currentEmployer === 'Bluefin Devices' && p.workHistory.filter(j => j.current).length === 2, 'two current jobs; current employer = Bluefin Devices');
  await opt.goto(X('options/options.html#profile'));
  await opt.waitForSelector('#jobsBox [data-exp-card]');
  check(await opt.$$eval('#jobsBox [data-exp-card]', x => x.length) === 4, 'Options shows 4 job cards');
  check(!(await opt.$('[data-path="currentEmployer"]')), 'no separate "Current employer" box that can disagree with the list');

  console.log('\n4) un-tick "I currently work here" on Bluefin Devices: end date comes back, saved automatically');
  const c0 = opt.locator('#jobsBox [data-exp-card] >> nth=0');
  await c0.locator('[data-f=current]').uncheck();
  check(!(await c0.locator('[data-f=endYear]').isDisabled()), 'end date enabled again');
  await c0.locator('[data-f=endMonth]').selectOption('3'); await c0.locator('[data-f=endYear]').fill('2025');
  await c0.locator('[data-f=current]').check();
  check(await c0.locator('[data-f=endYear]').inputValue() === '' && await c0.locator('[data-f=endYear]').isDisabled(), 'ticking current clears and disables the end date');
  await c0.locator('[data-f=current]').uncheck();
  check(await c0.locator('[data-f=endYear]').inputValue() === '2025' && await c0.locator('[data-f=endMonth]').inputValue() === '3', 'un-ticking restores the previous end date (Mar 2025)');
  await opt.waitForFunction(() => /Experience saved/.test(document.getElementById('saved').textContent), null, { timeout: 5000 });
  await scrollTo('#jobsBox');
  await opt.screenshot({ path: path.join(SHOTS, 'profile-experience-editor.png') });
  await unstick();
  await opt.locator('#jobsBox').screenshot({ path: path.join(SHOTS, 'profile-experience-cards.png') });
  await opt.reload(); await opt.waitForSelector('#jobsBox [data-exp-card]');
  const after = await opt.evaluate(() => [...document.querySelectorAll('#jobsBox [data-exp-card]')].map(c => ({ co: c.querySelector('[data-f=company]').value, cur: c.querySelector('[data-f=current]').checked, end: c.querySelector('[data-f=endYear]').value })));
  check(after[0].co === 'Bluefin Devices' && !after[0].cur && after[0].end === '2025' && after[1].cur, 'after reload: Bluefin not current (ended 2025), Code Club still current');
  p = await store();
  check(p.currentEmployer === 'Lakeview Code Club' && p.workHistory[0].end === 'Mar 2025', 'stored: current employer moved to Lakeview Code Club; end Mar 2025');

  console.log('\n4b) many jobs: no jank');
  const perf = await opt.evaluate(() => {
    const jobs = []; for (let i = 0; i < 150; i++) jobs.push({ title: 'Role ' + i, company: 'Company ' + i, start: 'Jan ' + (1990 + i % 30), end: i % 5 ? String(1991 + i % 30) : 'Present', bullets: ['a', 'b', 'c'] });
    const box = document.createElement('div'); document.body.appendChild(box);
    let calls = 0; const t0 = performance.now();
    const ed = JAA.expEditor.mount(box, jobs, { mode: 'profile', debounceMs: 50, onChange: () => { calls++; } });
    const mountMs = performance.now() - t0;
    const inp = box.querySelector('[data-f=title]'); const t1 = performance.now();
    for (let k = 0; k < 30; k++) { inp.value = 'Role x' + k; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    const typeMs = (performance.now() - t1) / 30;
    const n = ed.value().length; box.remove();
    return new Promise(r => setTimeout(() => r({ mountMs, typeMs, n, calls }), 200));
  });
  check(perf.n === 150 && perf.mountMs < 600 && perf.typeMs < 8, `150 cards render in ${Math.round(perf.mountMs)} ms; a keystroke costs ${perf.typeMs.toFixed(2)} ms`);
  check(perf.calls === 1, '30 quick keystrokes = 1 debounced save (' + perf.calls + ')');

  console.log('\n5) the stale tab from step 1 saves: nothing is lost');
  check(/updated in another tab/.test(await stale.textContent('#saved')), 'the stale tab says the profile changed elsewhere: ' + await stale.textContent('#saved'));
  await stale.click('#save');
  await sleep(500);
  p = await store();
  check(p.phone === '(555) 010-0177' && p.workHistory.length === 4 && p.currentEmployer === 'Lakeview Code Club', `stale tab kept its own edit (phone) and did not bring back "Old Co" (${p.workHistory.length} jobs, current ${p.currentEmployer})`);

  console.log('\n6) Fill uses the job that is marked current');
  const page = await ctx.newPage();
  await page.goto('https://jobs.lever.co/examplelabs/support-lead/apply', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#jaa-host button.btn', { timeout: 20000 });
  await page.locator('#jaa-host button.btn').click();
  await page.waitForFunction(() => document.getElementById('org').value, null, { timeout: 30000 }).catch(() => {});
  await sleep(500);
  const v = await page.evaluate(() => ({ org: document.getElementById('org').value, title: document.getElementById('ctitle').value, name: document.getElementById('name').value }));
  check(v.org === 'Lakeview Code Club' && v.title === 'Weekend Instructor', `Current company / title filled from the current job: ${v.title} at ${v.org}`);
  check(v.name === 'Casey Morgan', 'name filled');

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
  await ctx.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
