// v0.6.8: EEO regression matrix with the real extension. Every saved value (four decline wordings, "No"-style
// answers, "Yes"-style answers, not set) is filled into three forms with different EEO wordings
// (eeo-mocks/gh-eeo.html, mocks/greenhouse-classic.html, mocks/lever.html). Each EEO field must end up as:
// the form's decline option for a saved decline (or empty + marked for the user when the form has none),
// the matching option for a real answer, or empty + marked when not set. Never "Yes" or another category.
// A greedy mock model answers anything it is asked, to prove no EEO question reaches it.
// Fake data only; all ATS traffic is routed locally. Run: node dev-tests/e2e-eeo-matrix.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createMock } = require('./mock-ollama-v4');
const EXT = path.resolve(__dirname, '..');
let failures = 0, passes = 0;
const check = (c, m) => { if (c) passes++; else failures++; if (!c || process.env.VERBOSE) console.log((c ? '  PASS ' : '  FAIL ') + m); return c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PAGES = [
  { name: 'gh-eeo', url: 'https://job-boards.greenhouse.io/examplehq/jobs/901', file: 'eeo-mocks/gh-eeo.html' },
  { name: 'greenhouse-classic', url: 'https://boards.greenhouse.io/acme/jobs/4001', file: 'mocks/greenhouse-classic.html' },
  { name: 'lever', url: 'https://jobs.lever.co/acme/1234/apply', file: 'mocks/lever.html' }
];
const KEY_OF = [
  ['transgender', /transgender/i], ['sexualOrientation', /sexual orientation/i], ['hispanicLatino', /hispanic\/latino/i],
  ['ethnicity', /\brace\b/i], ['veteran', /veteran/i], ['disability', /disabilit/i], ['gender', /\bgender\b/i]
];
const all = v => ({ gender: v, transgender: v, sexualOrientation: v, ethnicity: v, hispanicLatino: v, veteran: v, disability: v });
const SCENARIOS = {
  "decline: I don't wish to answer": all("I don't wish to answer"),
  'decline: Decline to self-identify': all('Decline to self-identify'),
  'decline: Prefer not to say': all('Prefer not to say'),
  'decline: I do not want to answer': all('I do not want to answer'),
  'answers (no)': { gender: 'Female', transgender: 'No', sexualOrientation: 'Bisexual', ethnicity: 'Asian', hispanicLatino: 'No', veteran: 'I am not a protected veteran', disability: 'No, I do not have a disability' },
  'answers (yes)': { gender: 'Male', transgender: 'Yes', sexualOrientation: 'Heterosexual / straight', ethnicity: 'Two or more races', hispanicLatino: 'Yes', veteran: 'I identify as one or more of the classifications of protected veteran', disability: 'Yes, I have a disability' },
  'not set': all('')
};
const DECL = /wish to answer|decline|prefer not|rather not|choose not|want to answer/i;
const AGREES = {
  gender: { Male: /^male$/i, Female: /^female$/i },
  transgender: { No: /^no$/i, Yes: /^yes$/i },
  sexualOrientation: { Bisexual: /bisexual/i, 'Heterosexual / straight': /heterosexual|straight/i },
  ethnicity: { Asian: /^asian/i, 'Two or more races': /two or more/i },
  hispanicLatino: { No: /^no$/i, Yes: /^yes$/i },
  veteran: { 'I am not a protected veteran': /not a (protected )?veteran/i, 'I identify as one or more of the classifications of protected veteran': /identify as one or more|^i am a veteran/i },
  disability: { 'No, I do not have a disability': /^no,/i, 'Yes, I have a disability': /^yes,/i }
};
function expected(key, saved, options) {
  if (!saved) return '';
  if (DECL.test(saved)) return options.find(o => DECL.test(o)) || '';
  const re = AGREES[key][saved];
  return options.find(o => re.test(o)) || '';
}

(async () => {
  const requests = [];
  const route = (sys, j) => {
    const user = (j.messages || []).map(m => m.content).join('\n');
    requests.push(user);
    const m = user.match(/Questions \(JSON\): (\[.*\])/);
    if (!m) return null;
    let qs = []; try { qs = JSON.parse(m[1]); } catch (_) { /* ignore */ }
    const answers = {};
    for (const q of qs) answers[q.id] = (q.options && q.options[0]) || 'Yes';
    return JSON.stringify({ answers });
  };
  const mock = await createMock({ port: 11434, models: ['qwen2.5:3b'], allowExtensionOrigin: true, chatChunkMs: 1, route });
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-eeom-' + Date.now(), {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  const real = [];
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => {
    const u = new URL(r.request().url());
    const pg = PAGES.find(p => { const pu = new URL(p.url); return pu.host === u.host && pu.pathname.split('/').slice(0, 3).join('/') === u.pathname.split('/').slice(0, 3).join('/'); });
    if (pg && r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, pg.file), 'utf8') });
    real.push(r.request().method() + ' ' + u.href); return r.fulfill({ status: 404, body: 'blocked by test' });
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('dataVersion')).dataVersion >= 5) return; await new Promise(r => setTimeout(r, 50)); } });
  for (const p of ctx.pages()) if (/welcome\.html/.test(p.url())) await p.close();
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ onboarding: { done: true }, uiPrefs: { privacySeen: true },
      profile: Object.assign(JAA.merge(JAA.EMPTY_PROFILE, {}), { firstName: 'Sam', lastName: 'Haddad', email: 'sam.haddad@example.com', phone: '(555) 010-0144' }),
      settings: Object.assign({}, settings, { useLLM: true, model: 'qwen2.5:3b', ollamaUrl: 'http://127.0.0.1:11434', warmUp: false, panelAuto: 'manual' }) });
  });

  let fills = 0;
  for (const [scName, eeo] of Object.entries(SCENARIOS)) {
    console.log(`\n${scName}`);
    await sw.evaluate(async e => { const { profile } = await chrome.storage.local.get('profile'); profile.eeo = e; await chrome.storage.local.set({ profile }); }, eeo);
    for (const P of PAGES) {
      const pg = await ctx.newPage();
      await pg.goto(P.url);
      await pg.waitForSelector('#jaa-host .btn', { timeout: 15000 });
      await pg.locator('#jaa-host .btn').click();
      await pg.waitForFunction(() => /(Required|Optional) \d+ of \d+/.test(document.getElementById('jaa-host').shadowRoot.querySelector('.body').innerText), null, { timeout: 40000 });
      await pg.waitForFunction(() => !document.getElementById('jaa-host').shadowRoot.querySelector('.prog'), null, { timeout: 40000 }).catch(() => {});
      await sleep(800);
      fills++;
      const fields = await pg.evaluate(() => [...document.querySelectorAll('select')].map(s => {
        const lab = (s.labels && s.labels[0] ? s.labels[0].innerText : '') || (s.closest('label') ? s.closest('label').innerText : '');
        const o = s.selectedOptions[0];
        return { label: lab.split('\n')[0].trim(), value: o && o.value !== '' ? o.textContent.trim() : '', options: [...s.options].filter(x => x.value !== '').map(x => x.textContent.trim()), marked: s.classList.contains('jaa-todo') || !!s.closest('.jaa-todo') };
      }));
      let seen = 0;
      for (const f of fields) {
        const k = (KEY_OF.find(([, re]) => re.test(f.label)) || [])[0];
        if (!k) continue;
        seen++;
        const want = expected(k, eeo[k], f.options);
        check(f.value === want, `${P.name} · ${f.label}: saved ${JSON.stringify(eeo[k])} → ${JSON.stringify(f.value)} (expected ${JSON.stringify(want)})`);
        if (!want) check(f.marked, `${P.name} · ${f.label}: left empty and marked for you`);
        if (k === 'hispanicLatino' && eeo[k] !== 'Yes') check(f.value !== 'Yes', `${P.name} · Hispanic/Latino never "Yes" unless saved "Yes"`);
      }
      check(seen >= 3, `${P.name}: ${seen} EEO fields checked`);
      check(await pg.evaluate(() => window.__submits || 0) === 0, `${P.name}: nothing submitted`);
      await pg.close();
    }
  }
  const sent = requests.join('\n');
  check(!/gender|race\b|ethnic|hispanic|latino|veteran|disabilit|transgender|orientation|pronoun|Middle Eastern|Asian/i.test(sent.replace(/Today:[^\n]*\n/, '')), `no EEO question, option or value was sent to the model (${requests.length} requests)`);
  check(!real.length, 'no real network requests: ' + (real.join(', ') || 'none'));
  await ctx.close(); await mock.close();
  console.log(`\n${fills} fills, ${passes} checks passed` + (failures ? `, ${failures} FAILED` : '\nALL PASSED'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
