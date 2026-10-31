// v0.4 end-to-end: setup wizard (Ollama detection, Origin fix via declarativeNetRequest, RAM-based model
// choice, streamed /api/pull), resume import (fake DOCX + PDF), questions, practice application, tailoring
// (diff/approve, blocked invented facts, DOCX in place + PDF, attach), Options tailoring + library.
// Uses a mock Ollama on 127.0.0.1:11434 that enforces Origin like the real one. Fake data only.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createMock } = require('./mock-ollama-v4');
const EXT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'screenshots', 'v4');
const OUT = '/tmp/jaa-v4-out';
const FX = path.join(__dirname, 'fixtures');
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; return c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-v4-' + Date.now(), {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 }, acceptDownloads: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  const realHits = [];
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => { realHits.push(r.request().url()); r.fulfill({ status: 404, body: 'blocked by test' }); });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const X = p => `chrome-extension://${extId}/${p}`;
  const store = k => sw.evaluate(async k => chrome.storage.local.get(k), k);

  console.log('\n1) install opens the setup wizard (v0.6.7: resume import first); OS + RAM detected on the AI step');
  let wiz = ctx.pages().find(p => /onboarding\/welcome\.html/.test(p.url()));
  for (let i = 0; !wiz && i < 40; i++) { await sleep(150); wiz = ctx.pages().find(p => /onboarding\/welcome\.html/.test(p.url())); }
  check(!!wiz, 'welcome.html opened on install');
  await wiz.waitForSelector('#importBtn');
  check(await wiz.isVisible('#importBtn') && /Import your resume/.test(await wiz.innerText('#importBtn')), 'welcome: one primary action, "Import your resume"');
  await wiz.screenshot({ path: SHOTS + '/01-welcome.png' });
  const goStep = async h => { await wiz.goto('about:blank'); await wiz.goto(X('onboarding/welcome.html#' + h)); };
  await goStep('ollama');
  await wiz.waitForFunction(() => /GB of memory/.test(document.querySelector('[data-step=ollama]').innerText), null, { timeout: 8000 });
  const wtxt = await wiz.innerText('[data-step=ollama]');
  check(/Detected: Linux with \d+ GB of memory/.test(wtxt), 'detected: ' + (wtxt.match(/Detected:[^\n]*/) || [''])[0]);
  check(/won't need a terminal/.test(wtxt), 'says no terminal needed');
  const rec = await sw.evaluate(() => [recommendModel(8), recommendModel(4), recommendModel(16), recommendModel(32)]);
  check(rec.join() === 'qwen2.5:3b,qwen2.5:3b,qwen2.5:7b,qwen2.5:7b', 'RAM recommendation 8/4/16/32 GB: ' + rec.join(', '));

  console.log('\n2) Ollama not running: big download button, then auto-detect once it starts');
  await wiz.waitForSelector('#installBox:not(.hidden)', { timeout: 8000 });
  check(await wiz.getAttribute('#dlBtn', 'href') === 'https://ollama.com/download/linux', 'Linux download link (official)');
  check(await wiz.isDisabled('#ollamaNext'), 'Continue disabled while Ollama is missing');
  await wiz.screenshot({ path: SHOTS + '/02-ollama-download.png', fullPage: true });
  for (const [platform, url, shot] of [['MacIntel', 'https://ollama.com/download/Ollama.dmg', '13-welcome-mac.png'], ['Win32', 'https://ollama.com/download/OllamaSetup.exe', '14-welcome-windows.png']]) {
    const p = await ctx.newPage();
    await p.addInitScript(pl => { Object.defineProperty(navigator, 'platform', { get: () => pl }); Object.defineProperty(navigator, 'userAgentData', { get: () => undefined }); }, platform);
    await p.goto(X('onboarding/welcome.html#ollama'));
    await p.waitForSelector('#installBox:not(.hidden)');
    const href = await p.getAttribute('#dlBtn', 'href'), label = await p.innerText('#dlBtn');
    const steps = await p.innerText('#illus');
    check(href === url && (platform === 'MacIntel' ? /for Mac/.test(label) && /Applications/.test(steps) : /for Windows/.test(label) && /Install/.test(steps)), `${platform}: ${label} -> ${href}`);
    const manual = await p.innerHTML('#manualFix');
    check(platform === 'MacIntel' ? /launchctl setenv OLLAMA_ORIGINS/.test(manual) : /Edit environment variables for your account/.test(manual), `${platform}: manual fallback is OS-specific`);
    await p.screenshot({ path: SHOTS + '/' + shot, fullPage: true });
    await p.close();
  }
  const mock = await createMock({ port: 11434, models: [], pullMs: 2500 });
  await wiz.waitForFunction(() => /running.*connected/.test(document.getElementById('ollamaStatus').innerText), null, { timeout: 8000 });
  check(true, 'detected Ollama within one poll: ' + await wiz.innerText('#ollamaStatus'));
  const posts = mock.state.requests.filter(r => r.method === 'POST');
  check(posts.length > 0 && posts.every(r => !r.origin), `extension POSTs reach Ollama with the Origin header removed (${posts.length} POSTs, origins: ${JSON.stringify([...new Set(posts.map(r => r.origin))])})`);

  console.log('\n3) Origin: without the rule Ollama answers 403; "Try the automatic fix" restores it');
  await sw.evaluate(async () => { const r = await chrome.declarativeNetRequest.getDynamicRules(); await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: r.map(x => x.id) }); });
  const st403 = await sw.evaluate(() => ollamaStatus());
  check(st403.reachable && st403.originOk === false, 'rule removed: POST /api/show refused (403) like real Ollama');
  check(mock.state.requests.some(r => r.method === 'POST' && /^chrome-extension:\/\//.test(r.origin)), 'that request carried Origin: chrome-extension://…');
  await wiz.reload();
  await wiz.waitForSelector('#originBox:not(.hidden)', { timeout: 8000 });
  await wiz.screenshot({ path: SHOTS + '/03-ollama-origin-fix.png', fullPage: true });
  await wiz.click('#fixOrigin');
  await wiz.waitForFunction(() => /running.*connected/.test(document.getElementById('ollamaStatus').innerText), null, { timeout: 8000 });
  const rules = await sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  check(rules.length >= 2 && rules.every(r => r.action.type === 'modifyHeaders' && r.action.requestHeaders[0].header === 'origin' && r.condition.initiatorDomains[0] === extId), `automatic fix reinstalled ${rules.length} rules (remove Origin, only for this extension's own requests)`);
  // a web page talking to Ollama is NOT helped by our rule
  const web = await ctx.newPage();
  await web.route('http://example.test/', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>evil</h1>' }));
  await web.goto('http://example.test/');
  const webRes = await web.evaluate(async () => { try { const r = await fetch('http://127.0.0.1:11434/api/show', { method: 'POST', body: '{"model":"x"}' }); return r.status; } catch (e) { return 'blocked: ' + e.message; } });
  const lastWeb = mock.state.requests.filter(r => r.origin === 'http://example.test').length;
  check(webRes !== 404 && webRes !== 200, `a web page still can't use Ollama (${webRes}; reached the mock with its Origin ${lastWeb} times)`);
  await web.close();
  await wiz.click('#ollamaNext');

  console.log('\n4) model: recommended by RAM, /api/pull streamed with a progress bar');
  await wiz.waitForSelector('#modelCards .mcard');
  const recName = await wiz.evaluate(() => { const c = [...document.querySelectorAll('.mcard')].find(x => /Recommended/.test(x.innerText)); return c && c.innerText; });
  const sys = await sw.evaluate(() => platformInfo());
  check(recName && (sys.ramGB >= 15 ? /qwen2\.5:7b/.test(recName) : /qwen2\.5:3b/.test(recName)), `recommended for ${sys.ramGB} GB: ${(recName || '').split('\n').slice(1, 3).join(' ')}`);
  // pick the small one (faster mock run), then download
  await wiz.locator('.mcard', { hasText: 'qwen2.5:3b' }).click();
  await wiz.locator('#modelMsg button', { hasText: 'Download qwen2.5:3b' }).click();
  await wiz.waitForFunction(() => { const p = parseInt(document.getElementById('pullPct').textContent); return p > 20 && p < 90; }, null, { timeout: 8000 });
  const mid = await wiz.innerText('#pullBox');
  check(/(MB|GB) of 1\.93 GB/.test(mid), 'progress shows bytes: ' + mid.replace(/\s+/g, ' '));
  await wiz.screenshot({ path: SHOTS + '/04-model-pull.png', fullPage: true });
  await wiz.waitForFunction(() => /Downloaded ✓/.test(document.getElementById('pullTxt').textContent), null, { timeout: 15000 });
  await wiz.waitForFunction(() => !document.getElementById('modelNext').disabled, null, { timeout: 8000 });
  check((await store('settings')).settings.model === 'qwen2.5:3b', 'model saved to settings after the download');
  check(mock.state.requests.some(r => r.path === '/api/pull' && !r.origin), '/api/pull went through (Origin removed)');

  console.log('\n5) resume (fake DOCX) from the welcome step: parsed locally, AI facts checked, confirm checklist');
  await goStep('welcome');
  const [chooser] = await Promise.all([wiz.waitForEvent('filechooser'), wiz.click('#importBtn')]);
  check(!!chooser, '"Import your resume" opens the file chooser');
  await chooser.setFiles(path.join(FX, 'jordan-rivera-resume.docx'));
  await wiz.waitForSelector('#importer .check', { timeout: 20000 });
  const vals = await wiz.evaluate(() => Object.fromEntries([...document.querySelectorAll('#importer .check')].map(r => [r.querySelector('input[type=checkbox]').dataset.k, r.querySelector('.val input, .val textarea').value])));
  check(vals.firstName === 'Jordan' && vals.lastName === 'Rivera', 'name: ' + vals.firstName + ' ' + vals.lastName);
  check(vals.email === 'jordan.rivera@example.com' && /555/.test(vals.phone) && /linkedin\.com\/in\/jordan-rivera-example/.test(vals.linkedin), `regex facts: ${vals.email}, ${vals.phone}, ${vals.linkedin}`);
  const nowTxt = await wiz.textContent('#importer [data-exp-current]');
  check(/Data Engineer at Northwind Analytics/.test(nowTxt), 'current job (from the job marked current): ' + nowTxt);
  check(+vals.yearsExperience === new Date().getFullYear() - 2018, 'years of experience from work history only (not school): ' + vals.yearsExperience);
  const imp = await wiz.innerText('#importer');
  check(/Work history\s*2 jobs found/.test(imp) && !/Imaginary Corp/.test(imp.split('Left out')[0]), 'two real jobs; the invented "Imaginary Corp" job is not offered');
  check(/Left out because they are not in your resume text:.*(Imaginary|Kubernetes)/s.test(imp), 'dropped items are listed: ' + (imp.match(/Left out[^\n]*/) || [''])[0]);
  await wiz.screenshot({ path: SHOTS + '/05-resume-checklist.png', fullPage: true });
  await wiz.locator('#importer button', { hasText: 'Save to my profile' }).click();
  await wiz.waitForFunction(() => /is now your master resume/.test(document.getElementById('importer').innerText));
  let s = await store(['profile', 'resume', 'resumeMaster']);
  check(s.profile.firstName === 'Jordan' && s.profile.workHistory.length === 2 && s.profile.workHistory[0].bullets.length === 4, `profile saved: ${s.profile.workHistory.length} jobs, ${s.profile.workHistory[0].bullets.length} bullets copied from the resume`);
  check(!s.profile.skills.includes('Kubernetes') && s.profile.skills.includes('Airflow'), 'skills checked against the resume (Kubernetes dropped): ' + s.profile.skills.join(', '));
  check(s.resume && /docx$/.test(s.resume.name) && s.resumeMaster.kind === 'docx', 'master resume stored (docx)');
  await wiz.waitForSelector('#importDone:not(.hidden)', { timeout: 8000 });
  check(/jordan-rivera-resume\.docx/.test(await wiz.innerText('#importDoneTxt')) && await wiz.isVisible('#practiceBtn'), 'after saving: "Try it on a sample form" offered');
  await wiz.click('#importDone [data-next]');

  console.log('\n6) questions resumes lack, saved to the profile (EEO optional)');
  await wiz.waitForSelector('#qa .msg.bot .chip');
  const tap = async (re, label) => { await wiz.waitForFunction(r => { const c = [...document.querySelectorAll('#qa .msg.bot')].pop(); return c && new RegExp(r, 'i').test(c.innerText); }, re.source, { timeout: 5000 }); await wiz.locator('#qa .msg.bot').last().locator('button:not([disabled])', { hasText: label }).first().click(); };
  const firstQ = await wiz.evaluate(() => [...document.querySelectorAll('#qa .msg.bot')].pop().innerText);
  check(/authorized to work/.test(firstQ), 'phone/location already known from the resume, so it starts with work authorization');
  await tap(/authorized/, 'Yes'); await tap(/sponsorship/, 'No'); await tap(/18 or older/, 'Yes');
  await tap(/start a new job/, '2 weeks notice'); await tap(/relocating/, 'Depends on the role');
  await wiz.waitForFunction(() => /salary/i.test([...document.querySelectorAll('#qa .msg.bot')].pop().innerText));
  await wiz.locator('#qa .msg.bot').last().locator('input').fill('$95,000');
  await wiz.locator('#qa .msg.bot').last().locator('input').press('Enter');
  await tap(/^Gender/, "I don't wish to answer"); await tap(/Hispanic/, "I don't wish to answer"); await tap(/Race/, 'Skip'); await tap(/Veteran/, 'Skip'); await tap(/Disability/, 'Skip');
  await wiz.waitForFunction(() => /All done/.test(document.getElementById('qa').innerText));
  await wiz.screenshot({ path: SHOTS + '/06-questions.png', fullPage: true });
  s = await store('profile');
  const p = s.profile;
  check(p.workAuthorizedUS === 'Yes' && p.needsSponsorship === 'No' && p.over18 === 'Yes' && p.availability === '2 weeks notice' && p.willingToRelocate === 'Depends on the role' && p.salaryExpectation === '$95,000', 'answers saved to the profile');
  check(p.eeo.gender === "I don't wish to answer" && !p.eeo.ethnicity && !p.eeo.veteran && !p.eeo.disability, 'EEO: an explicit "I don\'t wish to answer" is saved; skipped ones stay empty (not set)');
  check(!JSON.stringify(p).match(/\b(pet|dog|cat)\b/i), 'no pet/personal details in the profile');
  await wiz.click('#qNext'); // -> AI helper (already connected) -> model (already downloaded) -> ready
  await wiz.waitForFunction(() => !document.getElementById('ollamaNext').disabled && document.querySelector('[data-step=ollama]').offsetParent, null, { timeout: 8000 });
  await wiz.click('#ollamaNext');
  await wiz.waitForFunction(() => !document.getElementById('modelNext').disabled && document.querySelector('[data-step=model]').offsetParent, null, { timeout: 8000 });
  await wiz.click('#modelNext');
  await wiz.waitForFunction(() => document.querySelectorAll('#summary .status').length === 4);
  const ready = await wiz.innerText('#summary');
  check((ready.match(/dot ok/g) || []).length >= 0 && /Ollama is running/.test(ready) && /qwen2\.5:3b/.test(ready) && /Master resume: jordan-rivera-resume\.docx/.test(ready) && /Jordan Rivera/.test(ready), 'ready summary');
  check(await wiz.evaluate(() => [...document.querySelectorAll('#summary .dot')].every(d => d.classList.contains('ok'))), 'all four checks green');
  await wiz.screenshot({ path: SHOTS + '/07-ready.png', fullPage: true });
  check((await store('onboarding')).onboarding.done === true, 'onboarding marked done');

  console.log('\n7) practice application (extension page): fill, never submit, not tracked');
  const [pr] = await Promise.all([ctx.waitForEvent('page'), wiz.click('#practice')]);
  await pr.waitForLoadState();
  check(/practice\/practice\.html/.test(pr.url()), 'test link opens the practice application');
  await pr.waitForSelector('#jaa-host .btn', { timeout: 15000 });
  await pr.evaluate(() => { window.__submits = 0; document.getElementById('application-form').addEventListener('submit', () => { window.__submits++; }, true); });
  await pr.locator('#jaa-host .btn').click();
  await pr.waitForFunction(() => /Needs you|need you|Nothing left/i.test(document.getElementById('jaa-host').shadowRoot.querySelector('.body').innerText), null, { timeout: 30000 });
  const pv = await pr.evaluate(() => ({ f: first_name.value, l: last_name.value, e: email.value, ph: phone.value, auth: q_auth.value, sp: q_sponsor.value, co: current_company.value, sal: salary.value, res: resume.files[0] && resume.files[0].name, consent: consent.checked }));
  check(pv.f === 'Jordan' && pv.l === 'Rivera' && pv.e === 'jordan.rivera@example.com' && pv.auth === 'Yes' && pv.sp === 'No', 'filled from the imported profile: ' + JSON.stringify(pv));
  check(pv.res === 'jordan-rivera-resume.docx', 'master resume attached: ' + pv.res);
  check(!pv.consent, 'consent box left for the user');
  check(await pr.evaluate(() => window.__submits) === 0, 'Submit never pressed');
  await pr.screenshot({ path: SHOTS + '/08-practice-chat.png' });

  console.log('\n8) chat: "tailor my resume for this job" -> diff, approve, DOCX in place + PDF, attach');
  await pr.locator('#jaa-host .composer textarea').fill('tailor my resume for this job');
  const [tp] = await Promise.all([ctx.waitForEvent('page'), pr.locator('#jaa-host .composer textarea').press('Enter')]);
  await tp.waitForLoadState();
  check(/tailor\/tailor\.html\?job=/.test(tp.url()), 'tailor page opened in a new tab');
  await tp.waitForFunction(() => /can be tailored/.test(document.getElementById('masterInfo').textContent), null, { timeout: 15000 });
  check(/Data Analyst · Example Co/.test(await tp.innerText('#jobTitle')) && +(await tp.innerText('#jdLen')) > 500, 'job title, company and description came from the page');
  // add a checkable rule in Options first
  await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); settings.tailoringRules = ['Keep to 1 page', 'Use US spelling', "Don't change job titles"]; await chrome.storage.local.set({ settings }); });
  await tp.reload(); await tp.waitForFunction(() => /can be tailored/.test(document.getElementById('masterInfo').textContent));
  await tp.click('#suggest');
  await tp.waitForSelector('#changesCard:not(.hidden)', { timeout: 30000 });
  const cards = await tp.$$eval('.change', cs => cs.map(c => ({ t: c.innerText, ok: !c.classList.contains('rejected'), on: c.querySelector('input').checked })));
  const blocked = cards.find(c => /Kubernetes/.test(c.t));
  check(blocked && !blocked.ok && /new number “60”|Kubernetes/.test(blocked.t), 'invented facts blocked: ' + (blocked ? blocked.t.split('\n').pop() : 'none'));
  check(cards.filter(c => c.ok).length >= 3, `${cards.filter(c => c.ok).length} valid suggestions (summary, skills order, bullet, reorder)`);
  check(/Rules sent:|Keep to 1 page/.test(JSON.stringify(mock.state.last.messages)), 'tailoring rules were passed to the model');
  await tp.screenshot({ path: SHOTS + '/09-tailor-diff.png', fullPage: true });
  // reject one valid change (the bullet reword), keep the rest
  const bulletCard = tp.locator('.change', { hasText: 'Defined experiment metrics' });
  await bulletCard.locator('input').uncheck();
  await tp.click('#build');
  await tp.waitForSelector('#resultCard:not(.hidden)', { timeout: 30000 });
  const links = await tp.$$eval('#files a', as => as.map(a => ({ name: a.getAttribute('download'), href: a.href.slice(0, 60) })));
  check(links.length === 2 && links[0].name === 'Jordan Rivera - Example Co - Data Analyst.docx' && links[1].name === 'Jordan Rivera - Example Co - Data Analyst.pdf', 'files: ' + links.map(l => l.name).join(' | '));
  const checksTxt = await tp.innerText('#checks');
  check(/Keep to 1 page/.test(checksTxt) && /✓/.test(checksTxt), 'rule check results shown: ' + checksTxt.replace(/\n/g, ' / ').slice(0, 200));
  await tp.screenshot({ path: SHOTS + '/10-tailor-result.png', fullPage: true });
  const lib = (await store('tailored')).tailored;
  check(lib.length === 1 && lib[0].files.length === 2 && lib[0].company === 'Example Co', 'saved to the tailored-resume library');
  // write outputs and render them
  for (const f of lib[0].files) fs.writeFileSync(path.join(OUT, f.name), Buffer.from(f.dataUrl.split(',')[1], 'base64'));
  const docxOut = path.join(OUT, 'Jordan Rivera - Example Co - Data Analyst.docx');
  const xml = execFileSync('unzip', ['-p', docxOut, 'word/document.xml']).toString();
  const plain = xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
  check(/turning product data into clear decisions/.test(plain) && /Data: Looker, PostgreSQL, dbt, Airflow, Spark/.test(plain), 'DOCX: accepted summary + skills order applied');
  check(!/Kubernetes/.test(plain) && !/Defined experiment metrics/.test(plain) && /Partnered with product managers/.test(plain), 'DOCX: blocked and rejected changes not applied');
  check(/Data Engineer, Northwind Analytics\tMar 2021 – Present/.test(plain) && /Software Developer, Contoso Retail\tJul 2018 – Feb 2021/.test(plain), 'DOCX: titles, companies, dates and tab layout untouched');
  const firstBullets = plain.split('Data Engineer, Northwind Analytics')[1].split('Software Developer')[0].split('\n').slice(1).map(x => x.trim()).filter(Boolean);
  check(/^Partnered with product managers/.test(firstBullets[0]), 'DOCX: bullet reorder applied (most relevant first): ' + firstBullets[0]);
  const origXml = execFileSync('unzip', ['-p', path.join(FX, 'jordan-rivera-resume.docx'), 'word/document.xml']).toString();
  const styleSig = x => (x.match(/<w:pStyle [^>]+>|<w:numPr>|<w:tabs>/g) || []).join('');
  check(styleSig(origXml) === styleSig(xml), 'DOCX: same paragraph styles, numbering and tab stops as the master');
  const R = path.join(OUT, 'render'); fs.mkdirSync(R, { recursive: true });
  execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', R, docxOut], { stdio: 'ignore' });
  execFileSync('pdftoppm', ['-r', '70', '-png', '-singlefile', path.join(R, path.basename(docxOut).replace(/\.docx$/, '.pdf')), path.join(SHOTS, '15-tailored-docx-render')]);
  execFileSync('pdftoppm', ['-r', '70', '-png', '-singlefile', path.join(FX, 'jordan-rivera-resume.pdf'), path.join(SHOTS, '15-master-docx-render')]);
  // our own PDF (template)
  const pdfOut = path.join(OUT, 'Jordan Rivera - Example Co - Data Analyst.pdf');
  check(fs.readFileSync(pdfOut).slice(0, 5).toString() === '%PDF-', 'PDF export created');
  execFileSync('pdftoppm', ['-r', '70', '-png', '-singlefile', pdfOut, path.join(SHOTS, '16-tailored-pdf-render')]);
  const pdfText = execFileSync('pdftotext', ['-layout', pdfOut, '-']).toString();
  check(/Jordan Rivera/.test(pdfText) && /turning product data/.test(pdfText) && !/Kubernetes/.test(pdfText), 'PDF text has the accepted changes only');
  // attach to the application
  await tp.click('#attach');
  await tp.waitForFunction(() => /Attached|Could not|No resume/.test(document.getElementById('attachOut').textContent), null, { timeout: 10000 });
  const att = await tp.innerText('#attachOut');
  const resNow = await pr.evaluate(() => resume.files[0] && resume.files[0].name);
  check(/Attached/.test(att) && resNow === 'Jordan Rivera - Example Co - Data Analyst.pdf', 'attached the tailored PDF to the application: ' + resNow);
  check(await pr.evaluate(() => window.__submits) === 0, 'still never submitted');
  // auto-attach on the next fill
  await pr.reload(); await pr.waitForSelector('#jaa-host .btn');
  await pr.locator('#jaa-host .btn').click();
  await pr.waitForFunction(() => resume.files.length > 0, null, { timeout: 30000 }).catch(() => {});
  check(await pr.evaluate(() => resume.files[0] && resume.files[0].name) === 'Jordan Rivera - Example Co - Data Analyst.pdf', 'Fill auto-attaches the tailored resume for this job');
  await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); settings.preferredResumeFormat = 'docx'; await chrome.storage.local.set({ settings }); });
  await pr.reload(); await pr.waitForSelector('#jaa-host .btn'); await pr.locator('#jaa-host .btn').click();
  await pr.waitForFunction(() => resume.files.length > 0, null, { timeout: 30000 }).catch(() => {});
  check(await pr.evaluate(() => resume.files[0] && resume.files[0].name) === 'Jordan Rivera - Example Co - Data Analyst.docx', 'preferred format Word: the .docx is attached');
  await pr.reload(); await pr.waitForSelector('#jaa-host .btn');
  await pr.evaluate(() => { document.getElementById('resume').accept = 'application/pdf,.pdf'; });
  await pr.locator('#jaa-host .btn').click();
  await pr.waitForFunction(() => resume.files.length > 0, null, { timeout: 30000 }).catch(() => {});
  check(await pr.evaluate(() => resume.files[0] && resume.files[0].name) === 'Jordan Rivera - Example Co - Data Analyst.pdf', 'PDF-only upload field: the PDF is attached even when Word is preferred');
  const apps = (await store('applications')).applications || [];
  check(apps.length === 0, 'practice page added nothing to the tracker');
  const bank = (await store('answerBank')).answerBank || [];
  check(bank.length === 0, 'practice page added nothing to the answer bank');

  console.log('\n9) PDF-only master: rebuilt from a template, honest note');
  const opt = await ctx.newPage();
  await opt.goto(X('options/options.html#resume'));
  await opt.setInputFiles('#importer input[type=file]', path.join(FX, 'jordan-rivera-resume.pdf'));
  await opt.waitForSelector('#importer .check', { timeout: 20000 });
  const pvals = await opt.evaluate(() => Object.fromEntries([...document.querySelectorAll('#importer .check')].map(r => [r.querySelector('input[type=checkbox]').dataset.k, r.querySelector('.val input, .val textarea').value])));
  check(pvals.firstName === 'Jordan' && pvals.email === 'jordan.rivera@example.com' && /Northwind Analytics/.test(await opt.textContent('#importer [data-exp-current]')), 'PDF resume parsed with bundled pdf.js: ' + pvals.firstName + ', ' + pvals.email);
  await opt.locator('#importer button', { hasText: 'Save to my profile' }).click();
  await opt.waitForFunction(() => /is now your master resume/.test(document.getElementById('importer').innerText));
  check((await store('resumeMaster')).resumeMaster.kind === 'pdf', 'master is now the PDF');
  await tp.reload(); await tp.waitForFunction(() => /can be tailored/.test(document.getElementById('masterInfo').textContent));
  check(/close to your original, not identical/.test(await tp.innerText('#layoutNote')), 'UI says the layout is approximate: ' + (await tp.innerText('#layoutNote')).slice(0, 90));
  await tp.click('#suggest'); await tp.waitForSelector('#changesCard:not(.hidden)', { timeout: 30000 });
  await tp.selectOption('#format', 'both');
  await tp.click('#build'); await tp.waitForFunction(() => document.querySelectorAll('#files a').length === 2, null, { timeout: 30000 });
  const lib2 = (await store('tailored')).tailored;
  const e2 = lib2[lib2.length - 1];
  check(e2.masterKind === 'pdf' && e2.files.map(f => f.name.split('.').pop()).join() === 'docx,pdf', 'PDF master: DOCX + PDF built from the template');
  const tdocx = path.join(OUT, 'from-pdf-master.docx'); fs.writeFileSync(tdocx, Buffer.from(e2.files[0].dataUrl.split(',')[1], 'base64'));
  execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', R, tdocx], { stdio: 'ignore' });
  execFileSync('pdftoppm', ['-r', '70', '-png', '-singlefile', path.join(R, 'from-pdf-master.pdf'), path.join(SHOTS, '17-template-docx-render')]);
  const tpdf = path.join(OUT, 'from-pdf-master-ours.pdf'); fs.writeFileSync(tpdf, Buffer.from(e2.files[1].dataUrl.split(',')[1], 'base64'));
  execFileSync('pdftoppm', ['-r', '70', '-png', '-singlefile', tpdf, path.join(SHOTS, '18-template-pdf-render')]);
  check(fs.existsSync(path.join(SHOTS, '17-template-docx-render.png')), 'template DOCX opens and renders in LibreOffice');

  console.log('\n10) Options: tailoring section and saved-resume library');
  await opt.goto(X('options/options.html#tailoring'));
  await opt.waitForSelector('#ruleList li');
  const rl = await opt.innerText('#ruleList');
  check(/Keep to 1 page[\s\S]*checked/.test(rl) && /Use US spelling/.test(rl), 'rules listed with "checked" tags');
  await opt.click('#ruleExamples .ex >> nth=0');
  await opt.fill('#ruleNew', 'Never remove my Northwind bullets'); await opt.click('#ruleAdd');
  await opt.fill('#ruleNew', 'Lead with analytics work'); await opt.click('#ruleAdd');
  const tags = await opt.$$eval('#ruleList li', ls => ls.map(l => l.innerText.replace(/\s*×\s*$/, '').replace(/\n/g, ' ')));
  check(tags.some(t => /Northwind bullets.*checked/.test(t)) && tags.some(t => /Lead with analytics.*AI/.test(t)), 'checkable vs AI-only rules: ' + tags.join(' | '));
  await opt.check('#s_attachTailored');
  await opt.click('#save');
  const s2 = (await store('settings')).settings;
  check(s2.tailoringRules.includes('Never remove my Northwind bullets') && s2.preferredResumeFormat === 'docx', 'rules + format saved');
  await opt.evaluate(() => document.getElementById('tailoring').scrollIntoView());
  await opt.screenshot({ path: SHOTS + '/11-options-tailoring.png' });
  await opt.evaluate(() => document.getElementById('library').scrollIntoView());
  await opt.waitForSelector('#libRows a.dl');
  const libTxt = await opt.innerText('#libRows');
  check((libTxt.match(/Data Analyst/g) || []).length === 2 && /⬇ PDF/.test(libTxt) && /⬇ Word/.test(libTxt), 'library lists both tailored resumes with download links');
  const [dl] = await Promise.all([opt.waitForEvent('download'), opt.click('#libRows a.dl >> nth=0')]);
  check(/Jordan Rivera - Example Co - Data Analyst\.(docx|pdf)/.test(dl.suggestedFilename()), 'download from the library: ' + dl.suggestedFilename());
  await opt.screenshot({ path: SHOTS + '/12-options-library.png' });
  // Options profile shows the imported work history
  await opt.goto(X('options/options.html#profile'));
  await opt.waitForSelector('#jobsBox [data-exp-card]');
  const jobsN = await opt.$$eval('#jobsBox [data-exp-card]', x => x.length);
  check(jobsN === 2, 'Options profile shows the imported work history (' + jobsN + ' jobs)');

  console.log('\n11) popup "Getting started" checklist (v0.6.7 replaces the "Finish setup" banner)');
  const pop = await ctx.newPage(); await pop.goto(X('popup/popup.html'));
  await pop.waitForSelector('#checklist:not([hidden])', { timeout: 8000 }).catch(() => {});
  check(await pop.isVisible('#checklist'), 'popup shows the setup checklist while setup is incomplete');
  await pop.close();

  check(realHits.length === 0, 'no request reached a real website: ' + realHits.slice(0, 3).join(', '));
  await mock.close();
  await ctx.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
