// v0.5 end-to-end with the real unpacked extension: icon status, resume match card, panel tabs (job card,
// privacy card, live progress + checklists, Profile copy, Tracker mini, Report), field toggles, application
// email, Refine-with-AI toolbar + feedback, cover letters (fact check, PDF/DOCX, fill + attach), tracking
// without Fill + "Application tracked" modal, Options tracker/fields/behaviour, popup, practice tour,
// lazy-loaded libraries, migration + what's new. Mock Ollama on 127.0.0.1:11434; every ATS URL is served
// from local mocks (v5-mocks/). Fake data only. Never submits anything real.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createMock } = require('./mock-ollama-v5');
const EXT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'screenshots', 'v5');
const OUT = '/tmp/jaa-v5-out';
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const M = f => fs.readFileSync(path.join(__dirname, 'v5-mocks', f), 'utf8');
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; return c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = k => !ONLY || ONLY.has(k);

const PROFILE = {
  firstName: 'Jordan', lastName: 'Rivera', email: 'jordan.rivera@example.com', phone: '(555) 010-0142',
  city: 'Springfield', state: 'IL', location: 'Springfield, IL', linkedin: 'https://www.linkedin.com/in/jordan-rivera-example',
  github: 'https://github.com/jordan-rivera-example', workAuthorizedUS: 'Yes', needsSponsorship: 'No', over18: 'Yes',
  currentEmployer: 'Northwind Analytics', currentTitle: 'Data Engineer', yearsExperience: '6',
  eeo: { gender: 'Decline to self-identify' }, salaryExpectation: '150000',
  summary: 'Data engineer with 6 years of experience building reliable batch and streaming pipelines.',
  workHistory: [
    { company: 'Northwind Analytics', title: 'Data Engineer', start: 'Mar 2021', end: 'Present', location: 'Springfield, IL', bullets: ['Built batch and streaming pipelines in Python and SQL that feed 40 internal dashboards', 'Modeled analytics data with dbt and PostgreSQL for Looker dashboards', 'Partnered with product managers on experiment analysis'] },
    { company: 'Contoso Retail', title: 'Software Developer', start: 'Jul 2018', end: 'Feb 2021', bullets: ['Automated reports with Airflow and Spark'] }
  ],
  educationList: [{ school: 'State University', degree: 'B.S.', field: 'Computer Science', start: '2014', end: '2018' }],
  skills: ['Python', 'SQL', 'Airflow', 'Spark', 'dbt', 'PostgreSQL', 'Looker', 'AWS', 'Docker', 'Git'],
  resumeText: 'Jordan Rivera\nData Engineer, Northwind Analytics (Mar 2021 – Present)\n• Built batch and streaming pipelines in Python and SQL that feed 40 internal dashboards\n• Modeled analytics data with dbt and PostgreSQL for Looker dashboards\n• Partnered with product managers on experiment analysis\nSoftware Developer, Contoso Retail (Jul 2018 – Feb 2021)\n• Automated reports with Airflow and Spark\nSkills: Python, SQL, Airflow, Spark, dbt, PostgreSQL, Looker, AWS, Docker, Git\nEducation: B.S. Computer Science, State University'
};

(async () => {
  const mock = await createMock({ port: 11434, models: ['qwen2.5:3b'], allowExtensionOrigin: true, chatChunkMs: 2 });
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-v5-' + Date.now(), {
    channel: 'chromium', headless: true, viewport: { width: 1360, height: 860 }, acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  const real = [], github = [];
  const posted = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const counters = {};
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async route => {
    const req = route.request(); const u = new URL(req.url()); const k = req.method() + ' ' + u.host + u.pathname;
    counters[k] = (counters[k] || 0) + 1;
    const html = b => route.fulfill({ status: 200, contentType: 'text/html', body: b });
    if (u.host === 'job-boards.greenhouse.io' && /^\/examplehq\/jobs\/(201|202|203)$/.test(u.pathname)) return req.method() === 'POST' ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : html(M('gh-job.html').replace('__POSTED__', posted));
    if (u.host === 'jobs.lever.co' && u.pathname === '/examplelabs/cccc-3333') return html(M('lever-posting.html'));
    if (u.host === 'jobs.lever.co' && u.pathname === '/examplelabs/cccc-3333/apply') return req.method() === 'POST' ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : html(M('lever-apply.html'));
    if (u.host === 'jobs.lever.co' && u.pathname === '/examplelabs/cccc-3333/thanks') return html(M('lever-thanks.html'));
    if (u.host === 'careers.example.org' || (u.host === 'www.linkedin.com' && u.pathname === '/feed/')) return html(M('unsupported.html'));
    if (u.host === 'github.com') { github.push(req.url()); return html('<h1>GitHub (blocked by test)</h1>'); }
    real.push(k); if (process.env.DEBUG_REAL) console.log('DEBUG real', req.url(), 'frame', (() => { try { return req.frame().url(); } catch (_) { return '?'; } })(), 'redirectedFrom', req.redirectedFrom() && req.redirectedFrom().url());
    return route.fulfill({ status: 404, body: 'blocked by test' });
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const X = p => `chrome-extension://${extId}/${p}`;
  const store = k => sw.evaluate(async k => chrome.storage.local.get(k), k);
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('dataVersion')).dataVersion >= 5) return; await new Promise(r => setTimeout(r, 50)); } });
  await sleep(300);
  // close the welcome tab opened on install
  for (const p of ctx.pages()) if (/welcome\.html/.test(p.url())) await p.close();
  const fixtureDocx = fs.readFileSync(path.join(__dirname, 'fixtures', 'jordan-rivera-resume.docx'));
  const seed = async (extra) => sw.evaluate(async s => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set(Object.assign({ profile: s.profile, answerBank: [{ q: 'How did you hear about us?', a: 'Company website', source: 'manual' }, { q: 'What is your favorite pet?', a: 'never', source: 'manual' }],
      settings: Object.assign({}, settings, { useLLM: true, model: 'qwen2.5:3b', ollamaUrl: 'http://127.0.0.1:11434', warmUp: false }, s.settings || {}),
      resume: { name: 'jordan-rivera-resume.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', dataUrl: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + s.docx, size: 9000 },
      onboarding: { done: true } }, s.extra || {}));
  }, { profile: PROFILE, docx: fixtureDocx.toString('base64'), extra, settings: extra && extra.settingsPatch });
  await seed();
  const hostText = (page, sel) => page.evaluate(sel => { const h = document.getElementById('jaa-host'); const el = h && h.shadowRoot.querySelector(sel); return el ? el.innerText : ''; }, sel);
  const inHost = (page, sel) => page.locator('#jaa-host').locator(sel); // Playwright pierces open shadow roots
  const tabTitle = (urlPat) => sw.evaluate(async u => { const [t] = await chrome.tabs.query({ url: u }); return t ? chrome.action.getTitle({ tabId: t.id }) : null; }, urlPat);

  /* ---------------------------------------------------------------- */
  if (want('migrate')) {
    console.log('\n1) migration to v0.5 data + what\'s new');
    await sw.evaluate(async () => chrome.storage.local.set({ dataVersion: 4, applications: [
      { key: 'greenhouse:oldco:1', company: 'Oldco', title: 'Analyst', url: 'https://job-boards.greenhouse.io/oldco/jobs/1', site: 'Greenhouse', status: 'Interview', date: '2026-09-01T10:00:00.000Z', history: [] },
      { key: 'greenhouse:oldco:2', company: 'Oldco', title: 'Engineer', url: 'https://job-boards.greenhouse.io/oldco/jobs/2', site: 'Greenhouse', status: 'Filled', date: '2026-09-02T10:00:00.000Z', history: [] }] }));
    const mig = await sw.evaluate(async () => { await migrateV5('update'); await noteWhatsNew('0.4.0'); await withTracker(() => null); return chrome.storage.local.get(['dataVersion', 'settings', 'whatsNew', 'tour']); });
    const rows = (await store('applications')).applications;
    check(mig.dataVersion === 5, 'dataVersion 5');
    check(mig.settings.trackWithoutFill === true && mig.settings.showMatch === true && mig.settings.panelAuto === 'manual' && mig.settings.useLLM === true, 'new settings added, existing kept');
    check(mig.whatsNew && mig.whatsNew.version === '0.5.0' && mig.whatsNew.from === '0.4.0' && !mig.whatsNew.seen, 'what\'s new noted for 0.4.0 → 0.5.0');
        check(rows.find(r => r.key === 'greenhouse:oldco:1').stage === 'interview' && rows.find(r => r.key === 'greenhouse:oldco:2').stage === 'saved', 'tracker rows got stages (Interview → interview, Filled → saved)');
    const pop = await ctx.newPage();
    await pop.goto(X('popup/popup.html'));
    await pop.waitForSelector('#whatsnew:not([hidden])', { timeout: 5000 }).catch(() => {});
    check(await pop.isVisible('#whatsnew'), 'popup shows the what\'s-new banner');
    check(await pop.isVisible('#profile') && await pop.isVisible('#tourLink'), 'popup has "My profile" and "Tour"');
    await pop.screenshot({ path: SHOTS + '/01-popup-whats-new.png' });
    await pop.click('#wnx');
    check((await store('whatsNew')).whatsNew.seen === true, 'dismiss marks it seen');
    await pop.close();
    await sw.evaluate(async () => chrome.storage.local.set({ applications: [] }));
  }

  /* ---------------------------------------------------------------- */
  let lp;
  if (want('match')) {
    console.log('\n2) job posting: colored icon, resume match card (lazy, cached), dismiss, improve');
    lp = await ctx.newPage();
    const t0 = Date.now();
    await lp.goto('https://jobs.lever.co/examplelabs/cccc-3333');
    await lp.waitForSelector('#jaa-match-host', { state: 'attached', timeout: 15000 });
    const shownAfter = Date.now() - t0;
    const card = await lp.evaluate(() => document.getElementById('jaa-match-host').shadowRoot.querySelector('.card').innerText);
    check(/Matches \d+ of \d+ keywords/.test(card), 'card: ' + (card.match(/Matches \d+ of \d+ keywords/) || [''])[0]);
    check(/Missing from your resume/.test(card) && /snowflake|kubernetes/i.test(card), 'missing keywords listed (Snowflake/Kubernetes)');
    check(!/Example Labs/i.test(card.split('Missing')[1] || ''), 'company name is not a "keyword"');
    check(shownAfter > 1000, `lazy: shown after ${shownAfter} ms (idle, not at load)`);
    const score = await lp.evaluate(() => +document.getElementById('jaa-match-host').shadowRoot.querySelector('.mres').dataset.score);
    check(score > 20 && score < 100, 'score ' + score + '%');
    await lp.screenshot({ path: SHOTS + '/02-match-card.png' });
    const title = await tabTitle('https://jobs.lever.co/*');
    check(/Lever · job posting/.test(title || ''), 'toolbar tooltip: ' + title);
    const cache = (await store('matchCache')).matchCache;
    check(cache && Object.keys(cache).length === 1, 'match cached per job');
    // Improve my match -> tailoring page
    const [tp] = await Promise.all([ctx.waitForEvent('page'), lp.locator('#jaa-match-host [data-act="improve"]').click()]);
    await tp.waitForLoadState();
    check(/tailor\/tailor\.html\?job=/.test(tp.url()), '"Improve my match" opens tailoring');
    await tp.close();
    // Details -> panel Resume tab with the full match + AI refinement
    await lp.locator('#jaa-match-host [data-act="details"]').click();
    await lp.waitForFunction(() => { const h = document.getElementById('jaa-host'); return h && /Matches \d+ of/.test(h.shadowRoot.querySelector('[data-view="resume"]').innerText); }, null, { timeout: 10000 });
    await inHost(lp, '[data-act="match-ai"]').click();
    await lp.waitForFunction(() => /refined by your local AI/.test(document.getElementById('jaa-host').shadowRoot.querySelector('[data-view="resume"]').innerText), null, { timeout: 15000 });
    const resTab = await hostText(lp, '[data-view="resume"]');
    check(/snowflake/i.test(resTab) && /Already in your resume/.test(resTab), 'Resume tab: full match, AI keywords merged (only ones in the JD)');
    check(!/stakeholder management/i.test(resTab), 'AI keyword not in the JD was dropped');
    check(/Cover letter/.test(resTab) && /No cover letter field/.test(resTab), 'Resume tab: cover letter status (none on a posting)');
    await lp.screenshot({ path: SHOTS + '/03-panel-resume-tab.png' });
    // dismiss
    await lp.reload();
    await lp.waitForSelector('#jaa-match-host', { state: 'attached', timeout: 15000 });
    await lp.locator('#jaa-match-host [data-act="dismiss"]').click();
    await lp.reload(); await sleep(3500);
    check(!(await lp.$('#jaa-match-host')), 'dismissed card stays hidden for this job');
  }

  /* ---------------------------------------------------------------- */
  let gp;
  if (want('fill')) {
    console.log('\n3) application: job card, privacy card, live progress, checklists, toggles, application email, safety');
    await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); settings.fieldToggles = { phone: false }; settings.applicationEmail = 'jobs.jordan@example.com'; await chrome.storage.local.set({ settings }); });
    gp = await ctx.newPage();
    await gp.goto('https://job-boards.greenhouse.io/examplehq/jobs/201');
    await gp.waitForSelector('#jaa-host .btn', { timeout: 15000 });
    check(!(await gp.$('#jaa-match-host')), 'no match card on the application form itself');
    const ttl = await tabTitle('https://job-boards.greenhouse.io/*');
    check(/Greenhouse · application form found/.test(ttl || ''), 'toolbar tooltip: ' + ttl);
    const icon = await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'https://careers.example.org/*' }); return t ? 'x' : 'none'; });
    void icon;
    // capture live progress
    const snaps = [];
    const poll = setInterval(async () => { try { snaps.push(await hostText(gp, '.body')); } catch (_) { /* navigating */ } }, 120);
    await inHost(gp, '.btn').click();
    await gp.waitForFunction(() => /Required \d+ of \d+/.test(document.getElementById('jaa-host').shadowRoot.querySelector('.body').innerText), null, { timeout: 40000 });
    clearInterval(poll);
    const scanned = snaps.find(s => /Scanning page… \d+ fields found/.test(s));
    check(!!scanned, 'live: "Scanning page… N fields found" (' + ((scanned || '').match(/Scanning page… \d+ fields found/) || [''])[0] + ')');
    check(snaps.some(s => /asking local AI|⏳/.test(s)), 'live: pending AI field shown while it waits');
    const body = await hostText(gp, '.body');
    check(/Required \d+ of \d+/.test(body) && /Optional \d+ of \d+/.test(body), 'checklists: ' + (body.match(/Required \d+ of \d+/) || [''])[0] + ', ' + (body.match(/Optional \d+ of \d+/) || [''])[0]);
    check(/✦/.test(body), '✦ marks the AI answer');
    const v = await gp.evaluate(() => ({ f: first_name.value, e: email.value, ph: phone.value, why: q_why.value, auth: q_auth.value, consent: consent.checked, sub: window.__submits, res: resume.files[0] && resume.files[0].name, li: linkedin.value }));
    check(v.f === 'Jordan' && v.auth === 'Yes' && v.res === 'jordan-rivera-resume.docx' && /linkedin/.test(v.li), 'profile fields filled');
    check(v.e === 'jobs.jordan@example.com', 'separate application email used: ' + v.e);
    check(v.ph === '', 'phone turned off in Fields to fill: left empty');
    check(/Turned off/.test(await gp.evaluate(() => document.getElementById('jaa-host').shadowRoot.innerHTML)) || /turned off/i.test(body), 'turned-off field explained');
    check(/mock essay/.test(v.why), 'AI drafted the long answer');
    check(!v.consent && v.sub === 0, 'consent untouched, Submit never pressed');
    const jc = await hostText(gp, '[data-card="job"]');
    check(/Senior Data Engineer/.test(jc) && /Example HQ/.test(jc) && /Chicago/.test(jc) && /140/.test(jc) && /2 days ago/.test(jc), 'job card: title, company, location, salary, posted (' + jc.replace(/\n/g, ' | ') + ')');
    check(/Everything stays on your computer/.test(await hostText(gp, '[data-card="privacy"]')), 'privacy card shown');
    await gp.screenshot({ path: SHOTS + '/04-fill-checklists.png' });
    // checklist row click jumps to the field
    await gp.evaluate(() => window.scrollTo(0, 0));
    await inHost(gp, 'details.cl[data-list="required"] summary').click().catch(() => {});
    const rowBtn = inHost(gp, 'details.cl[data-list="required"] .fl').last();
    await rowBtn.click();
    await sleep(600);
    check(await gp.evaluate(() => window.scrollY > 100), 'clicking a checklist row scrolls to the field');
    // privacy link
    const [pv] = await Promise.all([ctx.waitForEvent('page'), inHost(gp, '[data-card="privacy"] a').click()]);
    await pv.waitForLoadState();
    check(/privacy\/privacy\.html/.test(pv.url()) && /Everything stays on your computer/.test(await pv.innerText('body')), 'privacy page opens');
    await pv.screenshot({ path: SHOTS + '/05-privacy-page.png' }); await pv.close();
    // the prompts never carry EEO answers or salary
    const allPrompts = JSON.stringify(mock.state.requests.length ? mock.state.last : {});
    check(!/Decline to self-identify|150000/.test(allPrompts), 'last AI prompt has no EEO answer or salary');
    // bookmark from the job card
    await inHost(gp, '[data-card="job"] [data-act="bookmark"]').click();
    await sleep(500);
    const row = ((await store('applications')).applications || []).find(a => a.key === 'greenhouse:examplehq:201');
    check(row && row.bookmarked && row.location && /Chicago/.test(row.location) && row.salary, 'bookmarked with location + salary in the tracker');
  }

  /* ---------------------------------------------------------------- */
  if (want('refine') && gp) {
    console.log('\n4) Refine with AI toolbar + 👍/👎 feedback');
    await gp.evaluate(() => q_why.scrollIntoView({ block: 'center' }));
    const bar = gp.locator('[data-jaa-ui="refine"]');
    check(await bar.count() === 1, 'toolbar under the long-answer box');
    await bar.locator('[data-act="refine"]').click();
    await gp.screenshot({ path: SHOTS + '/06-refine-toolbar.png' });
    await bar.locator('[data-prompt="shorter"]').click();
    await gp.waitForFunction(() => /Shorter mock answer/.test(q_why.value), null, { timeout: 15000 });
    check(true, 'Shorter: ' + await gp.evaluate(() => q_why.value));
    check(/Make it shorter/.test(JSON.stringify(mock.state.last.messages)), 'instruction sent to the local model');
    await bar.locator('[data-act="refine"]').click();
    await bar.locator('input').fill('mention dbt');
    await bar.locator('[data-prompt="custom"]').click();
    await gp.waitForFunction(() => /Custom mock answer following: mention dbt/.test(q_why.value), null, { timeout: 15000 });
    check(true, 'custom instruction works');
    await bar.locator('[data-act="up"]').click();
    await sleep(300);
    let fb = (await store('draftFeedback')).draftFeedback || [];
    if (process.env.DEBUG) console.log(JSON.stringify(fb), await gp.evaluate(() => document.querySelector('[data-jaa-ui=refine]').shadowRoot.querySelector('.st').textContent));
    check(fb.length === 1 && fb[0].vote === 'up' && /Custom mock answer/.test(fb[0].text), '👍 stored locally');
    await bar.locator('[data-act="regen"]').click();
    await gp.waitForFunction(() => /Regenerated mock answer/.test(q_why.value), null, { timeout: 15000 });
    const prompt = JSON.stringify(mock.state.last.messages);
    check(/Answers the candidate liked/.test(prompt) && /Custom mock answer/.test(prompt), 'liked answer used as a positive example in the next draft');
    await bar.locator('[data-act="down"]').click(); await sleep(300);
    fb = (await store('draftFeedback')).draftFeedback || [];
    check(fb.some(x => x.vote === 'down'), '👎 stored');
    await bar.locator('[data-act="undo"]').click(); await sleep(300);
    check(await gp.evaluate(() => /Custom mock answer/.test(q_why.value)), 'Undo restores the previous text');
    check(await gp.evaluate(() => window.__submits) === 0 && !(await gp.evaluate(() => consent.checked)), 'still never submitted, consent untouched');
    await gp.screenshot({ path: SHOTS + '/07-refine-done.png' });
  }

  /* ---------------------------------------------------------------- */
  if (want('cover') && gp) {
    console.log('\n5) cover letter: detect upload field, write, fact check, approve, PDF/DOCX, attach');
    await inHost(gp, '.tab[data-tab="resume"]').click();
    await gp.waitForFunction(() => /Upload field/.test(document.getElementById('jaa-host').shadowRoot.querySelector('[data-view="resume"]').innerText), null, { timeout: 10000 });
    check(/Upload field \(optional\): empty/.test(await hostText(gp, '[data-view="resume"]')), 'Resume tab: cover letter upload detected, empty');
    const [cp] = await Promise.all([ctx.waitForEvent('page'), inHost(gp, '[data-act="cover"]').click()]);
    await cp.waitForLoadState();
    await cp.waitForFunction(() => /Using your resume/.test(document.getElementById('resumeInfo').textContent), null, { timeout: 10000 });
    check(/Senior Data Engineer · Example HQ/.test(await cp.innerText('#jobTitle')) && /Cover letter upload/.test(await cp.innerText('#fieldInfo')), 'cover page: job + field type');
    const libsNow = p => p.evaluate(() => ['JSZip', 'jspdf', 'pdfjsLib'].filter(k => typeof window[k] !== 'undefined'));
    const res0 = await libsNow(cp);
    check(res0.length === 0, 'no heavy library loaded on open (lazy)');
    await cp.click('#write');
    await cp.waitForSelector('#draftCard:not(.hidden)', { timeout: 20000 });
    let checksTxt = await cp.innerText('#checks');
    check(/Terraform/.test(checksTxt) && /45%/.test(checksTxt), 'fact check blocks invented tool + number: ' + checksTxt.replace(/\n/g, ' / ').slice(0, 160));
    check(await cp.isDisabled('#approve'), 'approve disabled while blocked');
    await cp.screenshot({ path: SHOTS + '/08-cover-blocked.png', fullPage: true });
    await cp.click('#regen');
    await cp.waitForFunction(() => /Your focus on experiments/.test(document.getElementById('letter').value), null, { timeout: 20000 });
    checksTxt = await cp.innerText('#checks');
    check(/Fact check passed/.test(checksTxt) && !(await cp.isDisabled('#approve')), 'second version passes');
    const coverPrompt = JSON.stringify(mock.state.last.messages);
    check(/Previous version/.test(coverPrompt) && /Northwind/.test(coverPrompt) && !/Decline to self-identify/.test(coverPrompt), 'prompt has resume + previous version, no EEO');
    await cp.click('#approve');
    await cp.waitForSelector('#useCard:not(.hidden)');
    await cp.selectOption('#format', 'both');
    await cp.click('#makeFiles');
    await cp.waitForFunction(() => document.querySelectorAll('#files a').length === 2, null, { timeout: 20000 });
    const names = await cp.$$eval('#files a', as => as.map(a => a.getAttribute('download')));
    check(names.includes('Jordan Rivera - Example HQ - Senior Data Engineer - Cover Letter.pdf') && names.includes('Jordan Rivera - Example HQ - Senior Data Engineer - Cover Letter.docx'), 'files: ' + names.join(' | '));
    const res1 = await libsNow(cp);
    check(res1.includes('JSZip') && res1.includes('jspdf') && !res1.includes('pdfjsLib'), 'libraries loaded only when needed: ' + res1.join(', '));
    const saved = (await store('coverLetters')).coverLetters || [];
    check(saved.length === 1 && saved[0].files.length === 2 && saved[0].jobKey === 'greenhouse:examplehq:201', 'saved on this computer, linked to the job');
    for (const f of saved[0].files) fs.writeFileSync(path.join(OUT, f.name), Buffer.from(f.dataUrl.split(',')[1], 'base64'));
    const pdfTxt = execFileSync('pdftotext', ['-layout', path.join(OUT, names.find(n => /\.pdf$/.test(n))), '-']).toString();
    check(/Jordan Rivera/.test(pdfTxt) && /Dear Example HQ hiring team/.test(pdfTxt) && /Sincerely/.test(pdfTxt) && !/Terraform/.test(pdfTxt), 'PDF content');
    try { execFileSync('pdftoppm', ['-r', '60', '-png', '-singlefile', path.join(OUT, names.find(n => /\.pdf$/.test(n))), path.join(SHOTS, '10-cover-letter-pdf')]); } catch (_) { /* optional */ }
    await cp.screenshot({ path: SHOTS + '/09-cover-approved.png', fullPage: true });
    await cp.click('#attach');
    await cp.waitForFunction(() => /Attached|Could not|No /.test(document.getElementById('attachOut').textContent), null, { timeout: 10000 });
    const attached = await gp.evaluate(() => cover_letter.files[0] && cover_letter.files[0].name);
    check(attached === 'Jordan Rivera - Example HQ - Senior Data Engineer - Cover Letter.pdf', 'attached to the application: ' + attached);
    check(await gp.evaluate(() => window.__submits) === 0, 'still never submitted');
    await cp.close();
    const row = ((await store('applications')).applications || []).find(a => a.key === 'greenhouse:examplehq:201');
    check(row && row.coverId === saved[0].id, 'tracker row links the cover letter');
    // text-box version on the Lever apply page
    const la = await ctx.newPage();
    await la.goto('https://jobs.lever.co/examplelabs/cccc-3333/apply');
    await la.waitForSelector('#jaa-host .btn', { timeout: 15000 });
    await inHost(la, '.btn').click();
    await la.waitForFunction(() => /Required \d+ of \d+|Nothing left/.test(document.getElementById('jaa-host').shadowRoot.querySelector('.body').innerText), null, { timeout: 30000 });
    const wc = inHost(la, '[data-act="write-cover"]');
    await wc.first().waitFor({ timeout: 10000 }).catch(() => {});
    check(await wc.count() >= 1, 'question card offers "Write it from my resume" for the cover letter box');
    const [cp2] = await Promise.all([ctx.waitForEvent('page'), wc.first().click()]);
    await cp2.waitForLoadState();
    await cp2.waitForFunction(() => /Using your resume/.test(document.getElementById('resumeInfo').textContent), null, { timeout: 10000 });
    check(/Cover letter text box/.test(await cp2.innerText('#fieldInfo')), 'text-box field detected');
    if (+(await cp2.innerText('#jdLen')) < 80) { await cp2.evaluate(() => { document.querySelector('#jobCard details').open = true; }); await cp2.fill('#jd', 'Analytics Engineer at Example Labs. SQL, Python, dbt, Snowflake, Airflow, Looker and A/B testing. Clear writing and curiosity.'); }
    await cp2.click('#write');
    await cp2.waitForSelector('#draftCard:not(.hidden)', { timeout: 20000 });
    if (await cp2.isDisabled('#approve')) { await cp2.click('#regen'); await cp2.waitForFunction(() => !document.getElementById('approve').disabled, null, { timeout: 20000 }); }
    await cp2.click('#approve');
    await cp2.click('#fillText');
    await cp2.waitForFunction(() => /Added|Could not|No /.test(document.getElementById('fillOut').textContent), null, { timeout: 10000 });
    const txt = await la.evaluate(() => document.querySelector('textarea[name="comments"]').value);
    check(/Dear Example HQ hiring team|Dear/.test(txt) && /Northwind/.test(txt), 'letter put into the text box');
    await cp2.close();
    await la.close();
  }

  /* ---------------------------------------------------------------- */
  if (want('profile') && gp) {
    console.log('\n6) Profile tab: click to copy (+ on an unsupported site via the popup path)');
    await inHost(gp, '.tab[data-tab="profile"]').click();
    await gp.waitForFunction(() => /Copy/.test(document.getElementById('jaa-host').shadowRoot.querySelector('[data-view="profile"]').innerText), null, { timeout: 8000 });
    const prof = await hostText(gp, '[data-view="profile"]');
    check(/jobs\.jordan@example\.com/.test(prof) && /Northwind Analytics/.test(prof) && /State University/.test(prof) && /Company website/.test(prof), 'contact (application email), experience, education, saved answers');
    check(!/favorite pet/i.test(prof), 'pet question never shown');
    await inHost(gp, '[data-view="profile"] [data-act="copy-desc"]').first().click();
    await sleep(300);
    const clip = await gp.evaluate(() => navigator.clipboard.readText());
    check(/• Built batch and streaming pipelines/.test(clip), '"Copy description" copies the bullets');
    const toast = await gp.evaluate(() => { const h = document.getElementById('jaa-toast-host'); return h ? h.shadowRoot.innerText || h.shadowRoot.textContent : ''; });
    check(/Copied description/.test(toast), 'copy toast');
    await gp.screenshot({ path: SHOTS + '/11-profile-tab.png' });
    // a page that isn't a supported job page (LinkedIn feed): gray icon; the popup's "My profile" opens the Profile tab.
    // (On sites without host access the popup injects the same scripts with activeTab; a test can't grant activeTab.)
    const up = await ctx.newPage();
    await up.goto('https://www.linkedin.com/feed/');
    await sleep(2500);
    check(!(await up.$('#jaa-host .btn:not([hidden])')) || !(await up.isVisible('#jaa-host .btn')), 'no Fill button on a non-job page');
    const r = await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'https://www.linkedin.com/feed/*' }); return chrome.tabs.sendMessage(t.id, { type: 'jaa:panel', tab: 'profile' }); }).catch(e => ({ error: String(e) }));
    await up.waitForFunction(() => { const h = document.getElementById('jaa-host'); return h && /Copy/.test(h.shadowRoot.querySelector('[data-view="profile"]').innerText); }, null, { timeout: 8000 }).catch(() => {});
    check(r && r.ok && /jordan/i.test(await hostText(up, '[data-view="profile"]')), 'Profile tab works on an unsupported site');
    check(!(await hostText(up, '.body')).match(/Scanning page/), 'no auto fill there');
    const gray = await tabTitle('https://www.linkedin.com/feed/*');
    check(/not a supported job page/.test(gray || ''), 'gray icon tooltip on unsupported site: ' + gray);
    await up.screenshot({ path: SHOTS + '/12-profile-unsupported-site.png' });
    /* Report tab on the unsupported site */
    console.log('\n7) Report a problem: diagnostics first, preview, GitHub URL, no personal data');
    await inHost(up, '.tab[data-tab="report"]').click();
    await up.waitForFunction(() => /Ollama/.test(document.getElementById('jaa-host').shadowRoot.querySelector('[data-view="report"]').innerText), null, { timeout: 8000 });
    const rep = await hostText(up, '[data-view="report"]');
    check(/isn't supported yet/.test(rep) && /Local AI \(Ollama\) is running/.test(rep) && /Model qwen2\.5:3b is downloaded/.test(rep) && /Profile/.test(rep), 'diagnostics: site, Ollama, model, profile');
    await inHost(up, '[data-act="request-site"]').click();
    await sleep(300);
    const prev = await up.evaluate(() => document.getElementById('jaa-host').shadowRoot.querySelector('[data-act="preview"]').textContent);
    check(/Please add support for www\.linkedin\.com/.test(prev) && /Category:\*\* Not supported site/.test(prev), '"Request support for this site" fills category + description');
    check(!/Jordan|Rivera|example\.com\/|jordan\.rivera|555|Northwind|Springfield/.test(prev), 'preview has no personal data');
    await up.screenshot({ path: SHOTS + '/13-report-tab.png' });
    const [gh] = await Promise.all([ctx.waitForEvent('page'), inHost(up, '[data-act="open-issue"]').click()]);
    await gh.waitForLoadState().catch(() => {});
    const ghUrl = decodeURIComponent(gh.url());
    check(/^https:\/\/github\.com\/YOUR-GITHUB-USERNAME\/job-apply-assistant\/issues\/new\?title=/.test(gh.url()), 'opens a prefilled GitHub new-issue URL');
    check(!/Jordan|jordan\.rivera|555-|Northwind/.test(ghUrl), 'issue URL has no personal data');
    await gh.close(); await up.close();
  }

  /* ---------------------------------------------------------------- */
  if (want('track')) {
    console.log('\n8) tracking without Fill + "Application tracked ✓" modal (notes + reminder)');
    const fillReq = async (pg, f, l, e) => {
      await pg.fill('#first_name', f); await pg.fill('#last_name', l); await pg.fill('#email', e);
      await pg.setInputFiles('#resume', { name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake') });
      await pg.fill('#q_why', 'I like the product.'); await pg.selectOption('#q_auth', 'Yes');
    };
    const tp = await ctx.newPage();
    await tp.goto('https://job-boards.greenhouse.io/examplehq/jobs/202');
    await tp.waitForSelector('#jaa-host .btn', { timeout: 15000 });
    await fillReq(tp, 'Jordan', 'Rivera', 'jordan.rivera@example.com');
    await tp.click('#submit');
    await tp.waitForFunction(() => !!document.getElementById('jaa-tracked-host'), null, { timeout: 15000 }).catch(async e => {
      console.log('DEBUG body:', (await tp.evaluate(() => document.body.innerText)).slice(0, 200), 'submits', await tp.evaluate(() => window.__submits));
      console.log('DEBUG apps:', JSON.stringify(((await store('applications')).applications || []).map(a => [a.key, a.status, a.via])));
      console.log('DEBUG settings:', JSON.stringify((await store('settings')).settings));
      throw e;
    });
    const modal = await tp.evaluate(() => document.getElementById('jaa-tracked-host').shadowRoot.querySelector('.m').innerText);
    check(/Application tracked ✓/.test(modal) && /Example HQ/.test(modal), 'modal: ' + modal.split('\n').slice(0, 2).join(' · '));
    await tp.screenshot({ path: SHOTS + '/14-application-tracked-modal.png' });
    await tp.locator('#jaa-tracked-host textarea').fill('Referred by a friend; follow up with the recruiter.');
    await tp.locator('#jaa-tracked-host input[type=date]').fill('2026-11-02');
    await tp.locator('#jaa-tracked-host [data-act="save"]').click();
    await sleep(500);
    const row = ((await store('applications')).applications || []).find(a => a.key === 'greenhouse:examplehq:202');
    check(row && row.status === 'Applied' && row.stage === 'applied' && row.via === 'tracked', 'tracked without Fill: Applied, stage applied');
    check(row && /Referred by a friend/.test(row.notes) && row.reminderAt === '2026-11-02', 'notes + reminder saved');
    await tp.close();
    // Lever: submit -> /thanks on the next page, no Fill
    const lv = await ctx.newPage();
    await lv.goto('https://jobs.lever.co/examplelabs/cccc-3333/apply');
    await lv.waitForSelector('#jaa-host .btn', { timeout: 15000 });
    await lv.fill('input[name=name]', 'Jordan Rivera'); await lv.fill('input[name=email]', 'jordan.rivera@example.com');
    await Promise.all([lv.waitForNavigation(), lv.click('.template-btn-submit')]);
    await lv.waitForFunction(() => !!document.getElementById('jaa-tracked-host'), null, { timeout: 15000 }).catch(() => {});
    const lrow = ((await store('applications')).applications || []).find(a => /examplelabs/.test(a.key || ''));
    check(lrow && lrow.status === 'Applied', 'Lever submit without Fill tracked through /thanks: ' + (lrow && lrow.status));
    await lv.close();
    // setting off -> not tracked
    await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); settings.trackWithoutFill = false; await chrome.storage.local.set({ settings }); });
    const t3 = await ctx.newPage();
    await t3.goto('https://job-boards.greenhouse.io/examplehq/jobs/203');
    await t3.waitForSelector('#jaa-host .btn', { timeout: 15000 });
    await fillReq(t3, 'J', 'R', 'j@example.com');
    await t3.click('#submit'); await sleep(2500);
    check(!((await store('applications')).applications || []).find(a => a.key === 'greenhouse:examplehq:203'), '"Track without Fill" off: not tracked');
    await t3.close();
    await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); settings.trackWithoutFill = true; await chrome.storage.local.set({ settings }); });
  }

  /* ---------------------------------------------------------------- */
  if (want('options')) {
    console.log('\n9) Options: tracker stepper/notes/filter/CSV, fields tree, behaviour, lazy libraries');
    const op = await ctx.newPage();
    await op.goto(X('options/options.html#tracker'));
    await op.waitForSelector('#appRows tr');
    const libs = await op.evaluate(() => ['JSZip', 'jspdf', 'pdfjsLib'].filter(k => typeof window[k] !== 'undefined'));
    check(!libs.length, 'Options opens without pdf.js / JSZip (lazy): ' + (libs.join(',') || 'none loaded'));
    const n0 = await op.locator('#appRows tr').count();
    await op.fill('#appSearch', 'Referred');
    check(await op.locator('#appRows tr').count() === 1, `search filters rows (${n0} → 1)`);
    await op.fill('#appSearch', '');
    const firstStage = op.locator('#appRows tr').first().locator('[data-stage="interview"]');
    await firstStage.click(); await sleep(500);
    const st = ((await store('applications')).applications || [])[0];
    check(st.stage === 'interview' && st.stageDates.interview && st.status === 'Interview', 'stepper: Interview with a date');
    await op.selectOption('#appStage', 'interview');
    check(await op.locator('#appRows tr').count() === 1, 'stage filter');
    await op.selectOption('#appStage', '');
    await op.check('#appSaved');
    check(await op.locator('#appRows tr').count() >= 1, 'saved-jobs filter');
    await op.uncheck('#appSaved');
    await op.screenshot({ path: SHOTS + '/15-options-tracker.png', fullPage: false });
    const [dl] = await Promise.all([op.waitForEvent('download'), op.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    check(/stage/.test(csv.split('\n')[0]) && /notes/.test(csv.split('\n')[0]) && /reminderAt/.test(csv.split('\n')[0]) && /Referred by a friend/.test(csv) && /Interview/.test(csv), 'CSV: stage, notes, reminder columns');
    // fields tree + behaviour (instant save)
    await op.goto(X('options/options.html#fields'));
    await op.waitForSelector('#fieldTree fieldset');
    await op.locator('#fieldTree [data-group="EEO"]').uncheck();
    await sleep(300);
    let s = (await store('settings')).settings;
    check(s.fieldToggles.gender === false && s.fieldToggles.veteran === false && s.fieldToggles.phone === false, 'group toggle turns off every EEO field (phone still off)');
    await op.locator('#fieldTree [data-field="phone"]').check(); await sleep(300);
    s = (await store('settings')).settings;
    check(s.fieldToggles.phone === undefined, 'single field back on');
    await op.selectOption('#s_panelAuto', 'auto'); await op.uncheck('#s_showMatch'); await sleep(300);
    s = (await store('settings')).settings;
    check(s.panelAuto === 'auto' && s.showMatch === false, 'behaviour settings saved instantly');
    await op.locator('#fields').screenshot({ path: SHOTS + '/16-options-fields.png' });
    await op.locator('#behaviour').screenshot({ path: SHOTS + '/17-options-behaviour.png' });
    // auto-open panel on the next application page, match card off
    const ap = await ctx.newPage();
    await ap.goto('https://job-boards.greenhouse.io/examplehq/jobs/203');
    await ap.waitForFunction(() => { const h = document.getElementById('jaa-host'); return h && h.shadowRoot.querySelector('.panel.open'); }, null, { timeout: 15000 }).catch(() => {});
    check(await ap.evaluate(() => !!document.getElementById('jaa-host').shadowRoot.querySelector('.panel.open')), 'panel opens automatically when set to auto');
    check(await ap.evaluate(() => !q_why.value && !first_name.value), 'auto-open does not fill by itself');
    const g = (await store('settings')).settings; g.fieldToggles = {}; g.panelAuto = 'manual'; g.showMatch = true; g.applicationEmail = '';
    await sw.evaluate(async s => chrome.storage.local.set({ settings: s }), g);
    await ap.close(); await op.close();
    // a PDF import still works with lazy pdf.js
    const op2 = await ctx.newPage();
    await op2.goto(X('options/options.html#resume'));
    const fileInput = op2.locator('#importer input[type=file]');
    if (await fileInput.count()) {
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'jordan-rivera-resume.pdf'));
      await op2.waitForFunction(() => /Found \d+ lines|Check each item|Could not/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
      const ok = await op2.evaluate(() => /Found \d+ lines|Check each item/.test(document.body.innerText));
      const libs2 = await op2.evaluate(() => ['JSZip', 'pdfjsLib'].filter(k => typeof window[k] !== 'undefined'));
      check(ok && libs2.includes('pdfjsLib') && !libs2.includes('JSZip'), 'PDF import loads pdf.js on demand and reads the resume');
    } else check(false, 'importer file input not found');
    await op2.close();
  }

  /* ---------------------------------------------------------------- */
  if (want('tour')) {
    console.log('\n10) practice tour: 10 coach marks with a fake person, nothing saved');
    const before = await store(['profile', 'answerBank', 'applications', 'draftFeedback', 'chats']);
    const pt = await ctx.newPage();
    await pt.goto(X('practice/practice.html?tour=1'));
    await pt.waitForSelector('#jaa-tour-host', { state: 'attached', timeout: 15000 });
    await pt.waitForFunction(() => { const h = document.getElementById('jaa-tour-host'); return h && h.shadowRoot.querySelector('.card[data-step]'); }, null, { timeout: 15000 });
    const step = () => pt.evaluate(() => document.getElementById('jaa-tour-host').shadowRoot.querySelector('.card').dataset.step);
    const cardText = () => pt.evaluate(() => document.getElementById('jaa-tour-host').shadowRoot.querySelector('.card').innerText);
    const next = async () => { await pt.locator('#jaa-tour-host .card [data-act="next"]:not([disabled])').click({ timeout: 40000 }); await sleep(500); };
    const seen = [];
    check(await step() === 'pin' && /Step 1 of 10/i.test(await cardText()) && await pt.evaluate(() => !!document.getElementById('jaa-tour-host').shadowRoot.querySelector('.card svg')), 'step 1: pin the extension, with illustration');
    await pt.screenshot({ path: SHOTS + '/18-tour-1-pin.png' }); seen.push(await step());
    await next(); seen.push(await step());
    await pt.screenshot({ path: SHOTS + '/19-tour-2-fill.png' });
    await next(); seen.push(await step());
    await pt.waitForTimeout(400);
    await pt.screenshot({ path: SHOTS + '/20-tour-3-progress.png' });
    await next(); seen.push(await step()); // saved answers (waits for the fill)
    const demo = await pt.evaluate(() => ({ f: first_name.value, e: email.value, sql: q_sql.value, why: q_why.value, consent: consent.checked }));
    check(demo.f === 'Sam' && /@example\.com$/.test(demo.e) && demo.sql === '3' && /Example Co/.test(demo.why) && !demo.consent, 'demo person filled (Sam Sample, saved answer, canned AI), consent untouched');
    await pt.screenshot({ path: SHOTS + '/21-tour-4-saved.png' });
    await next(); seen.push(await step());
    await pt.screenshot({ path: SHOTS + '/22-tour-5-refine.png' });
    await next(); seen.push(await step());
    await pt.waitForTimeout(600);
    await pt.screenshot({ path: SHOTS + '/23-tour-6-match.png' });
    await next(); seen.push(await step());
    await pt.screenshot({ path: SHOTS + '/24-tour-7-tailor.png' });
    await next(); seen.push(await step());
    await pt.screenshot({ path: SHOTS + '/25-tour-8-review.png' });
    await next(); seen.push(await step());
    check(await pt.locator('#jaa-tour-host .card [data-act="next"]').count() === 0, 'step 9 waits for the user to press Submit (no Next)');
    await pt.screenshot({ path: SHOTS + '/26-tour-9-submit.png' });
    await pt.click('#submit');
    check(/Tick the consent box first/.test(await pt.innerText('#sent')), 'practice submit asks for consent (never ticked for you)');
    await pt.check('#consent');
    await pt.click('#submit');
    await pt.waitForSelector('#confirmation:not([hidden])', { timeout: 5000 });
    check(true, 'practice confirmation shown');
    await pt.waitForFunction(() => /You're ready/.test(document.getElementById('jaa-tour-host').shadowRoot.innerHTML), null, { timeout: 8000 });
    await pt.screenshot({ path: SHOTS + '/27-tour-10-ready.png' });
    check(JSON.stringify(seen) === JSON.stringify(['pin', 'fill', 'progress', 'saved', 'refine', 'match', 'tailor', 'review', 'submit']), 'steps in order: ' + seen.join(' → ') + ' → ready');
    check(((await store('tour')).tour || {}).done === true, 'tour marked done');
    const after = await store(['profile', 'answerBank', 'applications', 'draftFeedback', 'chats']);
    check(JSON.stringify(before.profile) === JSON.stringify(after.profile) && JSON.stringify(before.answerBank) === JSON.stringify(after.answerBank) && JSON.stringify(before.applications) === JSON.stringify(after.applications), 'real profile, answers and tracker untouched by the tour');
    check(!JSON.stringify(after).includes('Sam Sample'), 'demo person never stored');
    await pt.locator('#jaa-tour-host [data-act="close"]').click();
    await pt.close();
    // re-runnable from Options and popup
    const op = await ctx.newPage(); await op.goto(X('options/options.html#behaviour'));
    const [t2] = await Promise.all([ctx.waitForEvent('page'), op.click('#tour')]);
    await t2.waitForLoadState();
    check(/practice\.html\?tour=1/.test(t2.url()), 'Options → Take the tour re-opens it');
    await t2.close(); await op.close();
  }

  /* ---------------------------------------------------------------- */
  console.log('\nsafety');
  check(!real.length, 'no real network requests: ' + (real.slice(0, 5).join(', ') || 'none'));
  const posts = Object.keys(counters).filter(k => /^POST/.test(k));
  check(posts.every(k => /examplehq\/jobs\/20[23]|examplelabs\/cccc-3333\/apply/.test(k)), 'only the user\'s own test submits reached the mock servers: ' + posts.join(', '));
  if (gp) check(await gp.evaluate(() => window.__submits) === 0, 'the filled application (201) was never submitted');
  await ctx.close(); await mock.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
