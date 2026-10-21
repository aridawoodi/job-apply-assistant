// v0.5.1: voluntary self-identification (EEO + pronouns) is never pre-set, guessed or defaulted.
// A) fresh install: every EEO value is empty ("Not set"); Options shows "Choose… (not set)" with explicit
//    choices incl. "I don't wish to answer"; resume import can't set EEO; Fill leaves every EEO field
//    empty + yellow, even with a greedy mock model that would answer anything and an answer bank that
//    contains EEO-looking entries; no EEO question or value reaches the model.
// B) existing user: explicitly saved answers survive the update migration and the Options round trip,
//    and are used on forms (exact category, no fallback to another one).
// Fake data only; all ATS traffic is routed locally.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createMock } = require('./mock-ollama-v4');
const EXT = path.resolve(__dirname, '..');
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; return c; };
const same = (a, b) => Object.keys(b).every(k => (a || {})[k] === b[k]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EEO_IDS = ['pronouns', 'gender', 'transgender', 'orientation', 'hispanic', 'race', 'describes', 'veteran', 'disability'];

(async () => {
  const requests = [];
  // a greedy model: answers every question with its first option (or "White"), to prove nothing EEO is asked
  const route = (sys, j) => {
    const user = (j.messages || []).map(m => m.content).join('\n');
    requests.push(user);
    const m = user.match(/Questions \(JSON\): (\[.*\])/);
    if (!m) return null;
    let qs = []; try { qs = JSON.parse(m[1]); } catch (_) { /* ignore */ }
    const answers = {};
    for (const q of qs) answers[q.id] = (q.options && q.options[0]) || 'White';
    return JSON.stringify({ answers });
  };
  const mock = await createMock({ port: 11434, models: ['qwen2.5:3b'], allowExtensionOrigin: true, chatChunkMs: 1, route });
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-eeo-' + Date.now(), {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  const real = [];
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, route2 => {
    const u = new URL(route2.request().url());
    if (u.host === 'job-boards.greenhouse.io' && /^\/examplehq\/jobs\/9\d\d$/.test(u.pathname)) return route2.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, 'eeo-mocks', 'gh-eeo.html'), 'utf8') });
    real.push(u.href); return route2.fulfill({ status: 404, body: 'blocked by test' });
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const X = p => `chrome-extension://${extId}/${p}`;
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('dataVersion')).dataVersion >= 5) return; await new Promise(r => setTimeout(r, 50)); } });
  for (const p of ctx.pages()) if (/welcome\.html/.test(p.url())) await p.close();

  console.log('\nA) fresh install');
  const fresh = await sw.evaluate(async () => { const { profile } = await JAA.loadAll(); return { eeo: profile.eeo, pronouns: profile.pronouns, stored: (await chrome.storage.local.get('profile')).profile || null }; });
  check(Object.values(fresh.eeo).every(v => v === '') && Object.keys(fresh.eeo).length === 7 && fresh.pronouns === '', 'every EEO value + pronouns empty on a fresh install: ' + JSON.stringify(fresh.eeo));
  check(!fresh.stored || !Object.values((fresh.stored || {}).eeo || {}).some(Boolean), 'nothing EEO written to storage on install');
  const sample = JSON.parse(fs.readFileSync(path.join(EXT, 'sample-profile.json'), 'utf8')).profile;
  check(Object.values(sample.eeo).every(v => v === '') && !sample.pronouns, 'sample-profile.json: EEO + pronouns empty');
  // Options
  const op = await ctx.newPage();
  await op.goto(X('options/options.html'));
  await op.waitForSelector('[data-path="eeo.ethnicity"]');
  const sel = await op.evaluate(() => [...document.querySelectorAll('select[data-eeo]')].map(s => ({ path: s.dataset.path, value: s.value, first: s.options[0].textContent, opts: [...s.options].map(o => o.textContent) })));
  check(sel.length === 7 && sel.every(s => s.value === '' && /^Choose…/.test(s.first)), 'Options: 7 EEO selects show "Choose… (not set)"');
  check(sel.every(s => s.opts.includes("I don't wish to answer")), 'Options: each has an explicit "I don\'t wish to answer"');
  check(await op.evaluate(() => document.querySelector('[data-path="pronouns"]').value === '' && document.querySelector('[data-path="pronouns"]').placeholder === 'Not set'), 'Options: pronouns empty ("Not set")');
  await op.screenshot({ path: path.join(__dirname, 'screenshots', 'v5', '28-options-eeo-not-set.png'), fullPage: false, clip: await op.evaluate(() => { const r = document.querySelector('[data-path="eeo.gender"]').closest('.grid').getBoundingClientRect(); window.scrollTo(0, r.top + scrollY - 120); return { x: 0, y: 0, width: 1280, height: 600 }; }) });
  // saving the profile without touching EEO keeps them empty
  await op.fill('[data-path="firstName"]', 'Sam'); await op.click('#save').catch(() => {}); await sleep(500);
  const afterSave = await sw.evaluate(async () => (await chrome.storage.local.get('profile')).profile);
  check(afterSave && afterSave.firstName === 'Sam' && Object.values(afterSave.eeo).every(v => v === ''), 'saving Options without choosing keeps EEO empty');
  // resume import can't set EEO, even if the parsed data claims it
  const imp = await op.evaluate(async () => {
    if (!JAA.resume) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '../lib/resume.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const p = JAA.resume.applyToProfile(JAA.merge(JAA.EMPTY_PROFILE, {}), { firstName: 'Sam', eeo: { gender: 'Male', ethnicity: 'White' }, gender: 'Male', ethnicity: 'White', pronouns: 'he/him', veteran: 'No' }, null);
    return { eeo: p.eeo, pronouns: p.pronouns, gender: p.gender };
  });
  check(Object.values(imp.eeo).every(v => v === '') && !imp.pronouns && !imp.gender, 'resume import never sets EEO or pronouns');

  // Fill with an empty-EEO profile + EEO-looking answer bank entries + greedy model
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ onboarding: { done: true }, uiPrefs: { privacySeen: true },
      profile: Object.assign(JAA.merge(JAA.EMPTY_PROFILE, {}), { firstName: 'Sam', lastName: 'Haddad', email: 'sam.haddad@example.com' }),
      answerBank: [{ q: 'Please identify your race', a: 'White', source: 'manual' }, { q: 'Gender', a: 'Male', source: 'manual' }, { q: 'Which of the following best describes you?', a: 'White', source: 'manual' }, { q: 'Veteran Status', a: 'I am not a protected veteran', source: 'manual' }],
      settings: Object.assign({}, settings, { useLLM: true, model: 'qwen2.5:3b', ollamaUrl: 'http://127.0.0.1:11434', warmUp: false, panelAuto: 'manual' }) });
  });
  const gp = await ctx.newPage();
  await gp.goto('https://job-boards.greenhouse.io/examplehq/jobs/901');
  await gp.waitForSelector('#jaa-host .btn', { timeout: 15000 });
  await gp.locator('#jaa-host .btn').click();
  await gp.waitForFunction(() => /Required \d+ of \d+/.test(document.getElementById('jaa-host').shadowRoot.querySelector('.body').innerText), null, { timeout: 40000 });
  await gp.waitForFunction(() => !document.getElementById('jaa-host').shadowRoot.querySelector('.prog'), null, { timeout: 40000 }).catch(() => {});
  await sleep(1500);
  const st = await gp.evaluate(ids => ids.map(id => { const el = document.getElementById(id); return { id, value: el.value, yellow: el.classList.contains('jaa-todo') || !!el.closest('.jaa-todo') }; }), EEO_IDS);
  check(st.every(x => x.value === ''), 'every EEO / pronoun field left empty: ' + st.map(x => x.id + '=' + JSON.stringify(x.value)).join(' '));
  check(st.every(x => x.yellow), 'every EEO / pronoun field marked yellow for the user (' + st.filter(x => x.yellow).length + '/' + st.length + ')');
  check(await gp.inputValue('#first_name') === 'Sam' && await gp.inputValue('#q_city') === 'White', 'non-EEO fields still filled (profile + model), so the model did run');
  const sent = requests.join('\n');
  check(!/gender|race|ethnic|hispanic|latino|veteran|disabilit|transgender|orientation|pronoun|best describes|Middle Eastern|Asian/i.test(sent.replace(/Today:[^\n]*\n/, '')), 'no EEO question, option or value was sent to the model (' + requests.length + ' requests)');
  await gp.screenshot({ path: path.join(__dirname, 'screenshots', 'v5', '29-eeo-fields-stay-yellow.png') });
  check(await gp.evaluate(() => window.__submits || 0) === 0, 'nothing submitted');
  await gp.close();

  console.log('\nB) existing user with their own saved answers');
  const OWN = { gender: 'Female', transgender: 'No', sexualOrientation: "I don't wish to answer", ethnicity: 'Middle Eastern or North African', hispanicLatino: 'No', veteran: 'I am not a protected veteran', disability: 'Decline To Self Identify' };
  await sw.evaluate(async own => { const { profile } = await chrome.storage.local.get('profile'); profile.eeo = own; profile.pronouns = 'she/her'; await chrome.storage.local.set({ profile, dataVersion: 4 }); }, OWN);
  await sw.evaluate(async () => { await migrateV5('update'); await noteWhatsNew('0.5.0'); await withTracker(() => null); });
  const kept = await sw.evaluate(async () => (await chrome.storage.local.get('profile')).profile);
  check(same(kept.eeo, OWN) && kept.pronouns === 'she/her', 'update migration keeps the saved answers exactly');
  await op.reload(); await op.waitForSelector('[data-path="eeo.ethnicity"]');
  const shown = await op.evaluate(() => Object.fromEntries([...document.querySelectorAll('select[data-eeo]')].map(s => [s.dataset.path.slice(4), s.value])));
  check(JSON.stringify(Object.keys(OWN).reduce((o, k) => (o[k] = shown[k], o), {})) === JSON.stringify(OWN), 'Options shows the saved answers (incl. own wording "Decline To Self Identify")');
  await op.fill('[data-path="lastName"]', 'Haddad-Smith'); await op.click('#save').catch(() => {}); await sleep(500);
  const kept2 = await sw.evaluate(async () => (await chrome.storage.local.get('profile')).profile);
  check(same(kept2.eeo, OWN) && kept2.lastName === 'Haddad-Smith', 'Options save round trip keeps them');
  const g2 = await ctx.newPage();
  await g2.goto('https://job-boards.greenhouse.io/examplehq/jobs/902');
  await g2.waitForSelector('#jaa-host .btn', { timeout: 15000 });
  await g2.locator('#jaa-host .btn').click();
  await g2.waitForFunction(() => /Required \d+ of \d+/.test(document.getElementById('jaa-host').shadowRoot.querySelector('.body').innerText), null, { timeout: 40000 });
  await sleep(1500);
  const v = id => g2.inputValue('#' + id);
  check(await v('gender') === 'Female' && await v('race') === 'Middle Eastern or North African' && await v('veteran') === 'I am not a protected veteran' && await v('pronouns') === 'she/her' && await v('orientation') === "I don't wish to answer", 'saved answers are filled (race: the exact category, never another)');
  check(await v('disability') === "I don't wish to answer" && await v('hispanic') === 'No' && await v('transgender') === 'No', 'own "decline" wording maps to the form\'s decline option');
  check(await v('describes') === '', 'an unlabeled EEO-style question is still left to the user (no guess from the saved race)');
  await g2.close();
  check(!real.length, 'no real network requests: ' + (real.join(', ') || 'none'));
  await ctx.close(); await mock.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
