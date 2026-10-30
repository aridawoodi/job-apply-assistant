// Real-Ollama run (no mock): the Origin fix against a real Ollama server, resume extraction and
// tailoring with a real local model. Defaults to the fake Jordan Rivera fixtures and a made-up job.
// Env: OLLAMA_URL (default http://127.0.0.1:11434), MODEL (qwen2.5:3b), RESUME_DOCX, RESUME_PDF,
//      JOB_FILE (plain-text job description), JOB_TITLE, JOB_COMPANY, JOB_URL, OUT_DIR, SHOTS_DIR.
// Example: OLLAMA_URL=http://127.0.0.1:11435 node e2e-real-ollama.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const EXT = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures');
const E = process.env;
const OLLAMA = E.OLLAMA_URL || 'http://127.0.0.1:11434', MODEL = E.MODEL || 'qwen2.5:3b';
const DOCX = E.RESUME_DOCX || path.join(FX, 'jordan-rivera-resume.docx');
const PDF = E.RESUME_PDF || path.join(FX, 'jordan-rivera-resume.pdf');
const OUT = E.OUT_DIR || '/tmp/jaa-real-out';
const SHOTS = E.SHOTS_DIR || path.join(__dirname, 'screenshots', 'v4', 'real');
const JOB = {
  title: E.JOB_TITLE || 'Data Analyst', company: E.JOB_COMPANY || 'Example Co', url: E.JOB_URL || 'https://example.com/jobs/1',
  description: E.JOB_FILE ? fs.readFileSync(E.JOB_FILE, 'utf8') : fs.readFileSync(path.join(EXT, 'practice', 'practice.html'), 'utf8').split('id="job-description">')[1].split('</div>')[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
};
JOB.key = E.JOB_KEY || 'real:' + JOB.company.toLowerCase();
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; return c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fields = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#importer .check')].map(r => [r.querySelector('input[type=checkbox]').dataset.k, r.querySelector('.val input, .val textarea').value])));

(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-real-' + Date.now(), {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  const realHits = [];
  await ctx.route(/^https:\/\//, r => { realHits.push(r.request().url()); r.fulfill({ status: 404, body: 'blocked by test' }); });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const X = p => `chrome-extension://${extId}/${p}`;
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('dataVersion')).dataVersion >= 4) return; await new Promise(r => setTimeout(r, 50)); } });
  await sw.evaluate(async s => { const st = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: Object.assign({}, st.settings, s), onboarding: { done: true } }); }, { ollamaUrl: OLLAMA, model: MODEL, useLLM: true });
  await sleep(500);

  console.log(`\n1) Origin fix against the real Ollama at ${OLLAMA}`);
  let st = await sw.evaluate(() => ollamaStatus());
  check(st.reachable && st.originOk === true, `with the rule: reachable, POST allowed (version ${st.version}, ${st.models.length} models, hasModel=${st.hasModel})`);
  await sw.evaluate(async () => { const r = await chrome.declarativeNetRequest.getDynamicRules(); await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: r.map(x => x.id) }); });
  st = await sw.evaluate(() => ollamaStatus());
  check(st.reachable && st.originOk === false, 'without the rule: real Ollama refuses the extension (HTTP 403)');
  const fix = await sw.evaluate(() => installOriginRules().then(() => ollamaStatus()));
  check(fix.originOk === true, 'after "Try the automatic fix" (rules reinstalled): allowed again');

  console.log('\n2) resume extraction with the real model (PDF, then DOCX)');
  const opt = await ctx.newPage();
  await opt.goto(X('options/options.html#resume'));
  const results = {};
  for (const [kind, file] of [['pdf', PDF], ['docx', DOCX]]) {
    const t0 = Date.now();
    await opt.setInputFiles('#importer input[type=file]', file);
    await opt.waitForFunction(() => /Check each item|could not help/.test(document.getElementById('importer').innerText), null, { timeout: 600000 });
    const v = await fields(opt);
    const txt = await opt.innerText('#importer');
    results[kind] = { secs: Math.round((Date.now() - t0) / 1000), v, jobs: (txt.match(/(\d+) jobs? found/) || [])[1], now: (txt.match(/current employer use ([^\n(]*)/) || [])[1], edu: (txt.match(/Education \((\d+)\)/) || [])[1], skills: (txt.match(/Skills \((\d+)\)/) || [])[1], dropped: (txt.match(/Left out[^\n]*/) || [''])[0], aiError: /could not help/.test(txt) };
    console.log(`  ${kind}: ${results[kind].secs}s · ${v.firstName} ${v.lastName} · ${v.email} · ${v.phone} · ${v.location} · ${v.linkedin} · now ${results[kind].now} · ${v.yearsExperience} yrs · jobs ${results[kind].jobs} · edu ${results[kind].edu} · skills ${results[kind].skills}`);
    if (results[kind].dropped) console.log('    ' + results[kind].dropped.slice(0, 300));
    check(!results[kind].aiError && v.firstName && v.lastName && v.email && +results[kind].jobs >= 1, `${kind}: name, email and work history extracted`);
    await opt.screenshot({ path: path.join(SHOTS, `real-import-${kind}.png`), fullPage: true });
    if (kind === 'docx') {
      await opt.locator('#importer button', { hasText: 'Save to my profile' }).click();
      await opt.waitForFunction(() => /is now your master resume/.test(document.getElementById('importer').innerText));
    }
  }
  const prof = (await sw.evaluate(() => chrome.storage.local.get('profile'))).profile;
  fs.writeFileSync(path.join(OUT, 'extracted-profile.json'), JSON.stringify({ results, workHistory: prof.workHistory, educationList: prof.educationList, skills: prof.skills, certifications: prof.certifications }, null, 2));
  check(results.pdf.v.email === results.docx.v.email && results.pdf.v.lastName === results.docx.v.lastName, 'PDF and DOCX agree on the basics');

  console.log(`\n3) tailoring for "${JOB.title}" at ${JOB.company} with the real model`);
  const [tp] = await Promise.all([ctx.waitForEvent('page'), sw.evaluate(j => tailorOpen({ job: j }, null), JOB)]);
  await tp.waitForFunction(() => /can be tailored/.test(document.getElementById('masterInfo').textContent), null, { timeout: 20000 });
  const t1 = Date.now();
  await tp.click('#suggest');
  await tp.waitForFunction(() => !document.getElementById('changesCard').classList.contains('hidden') || /error|took too long|did not return|Could not/i.test(document.getElementById('sugStatus').textContent), null, { timeout: 900000 });
  console.log('  model time: ' + Math.round((Date.now() - t1) / 1000) + 's · ' + await tp.innerText('#sugStatus'));
  const cards = await tp.$$eval('.change', cs => cs.map(c => ({ ok: !c.classList.contains('rejected'), text: c.innerText })));
  cards.forEach((c, i) => console.log(`  [${c.ok ? 'ok     ' : 'BLOCKED'}] ${c.text.replace(/\n+/g, ' | ').slice(0, 400)}`));
  check(cards.length > 0, cards.length + ' suggestions');
  await tp.screenshot({ path: path.join(SHOTS, 'real-tailor-diff.png'), fullPage: true });
  await tp.selectOption('#format', 'both');
  await tp.click('#build');
  await tp.waitForFunction(() => document.querySelectorAll('#files a').length === 2 || /Could not create/.test(document.getElementById('checks').innerText), null, { timeout: 60000 });
  console.log('  ' + (await tp.innerText('#checks')).replace(/\n+/g, ' / '));
  await tp.screenshot({ path: path.join(SHOTS, 'real-tailor-result.png'), fullPage: true });
  const lib = (await sw.evaluate(() => chrome.storage.local.get('tailored'))).tailored;
  const entry = lib[lib.length - 1];
  const R = path.join(OUT, 'render'); fs.mkdirSync(R, { recursive: true });
  for (const f of entry.files) {
    const fp = path.join(OUT, f.name);
    fs.writeFileSync(fp, Buffer.from(f.dataUrl.split(',')[1], 'base64'));
    console.log('  wrote ' + fp);
    let pdfPath = fp;
    if (/\.docx$/.test(fp)) { execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', R, fp], { stdio: 'ignore' }); pdfPath = path.join(R, path.basename(fp).replace(/\.docx$/, '.pdf')); }
    execFileSync('pdftoppm', ['-r', '60', '-png', pdfPath, path.join(SHOTS, 'real-tailored-' + (/\.docx$/.test(fp) ? 'docx' : 'pdf'))]);
  }
  execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', R, DOCX], { stdio: 'ignore' });
  execFileSync('pdftoppm', ['-r', '60', '-png', path.join(R, path.basename(DOCX).replace(/\.docx$/, '.pdf')), path.join(SHOTS, 'real-master-docx')]);
  check(entry.files.length === 2, 'tailored DOCX + PDF saved');
  check(realHits.length === 0, 'no request reached a real website');
  await ctx.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
