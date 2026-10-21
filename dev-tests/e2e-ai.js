// Loaded-extension test: warm-up, think:false, batching/progressive fill, per-batch timeouts,
// retry, <think> stripping, think-rejection fallback, and answer learning. ATS pages are routed
// to local mocks; Ollama is mock-ollama2.js (must be running).
const { chromium } = require('playwright');
const fs = require('fs');
const EXT = '/workspace/job-apply-extension';
const CTL = '/tmp/mock-ollama-ctl.json', LOG = '/tmp/mock-ollama-log.jsonl';
const setCtl = o => fs.writeFileSync(CTL, JSON.stringify(o));
const readLog = () => fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  setCtl({});
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-ai-' + Date.now(), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  await ctx.route(/https:\/\/([a-z-]+\.)?(greenhouse\.io|lever\.co|ashbyhq\.com)\//, route => {
    const u = new URL(route.request().url());
    if (/^\/mockco\/jobs\/2\d\d$/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(__dirname + '/submit-mocks/gh-many.html', 'utf8') });
    return route.fulfill({ status: 404, body: 'blocked by test' });
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  // let the install handler (tracker migration, v0.4 migration, Origin rule) finish before seeding storage
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('dataVersion')).dataVersion >= 4) return; await new Promise(r => setTimeout(r, 50)); } });
  await new Promise(r => setTimeout(r, 200));
  const sample = JSON.parse(fs.readFileSync(EXT + '/dev-tests/fixtures/test-profile.json'));
  const bank0 = sample.answerBank.concat([{ q: "What's your preferred programming language?", a: 'JavaScript', source: 'manual' }]);
  const setSettings = s => sw.evaluate(async s => { const st = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: Object.assign({}, st.settings, s) }); }, s);
  await sw.evaluate(async s => chrome.storage.local.set(s), { profile: Object.assign({}, sample.profile, { resumeText: 'Software engineer at Northwind since 2021. Built internal tools.' }), answerBank: bank0, settings: Object.assign({}, sample.settings, { model: 'qwen3.5:4b', llmBatchSize: 5, llmTimeoutSec: 90, llmFirstTimeoutSec: 180 }) });
  const panel = p => p.evaluate(() => { const h = document.getElementById('jaa-host'); const pn = h && h.shadowRoot.querySelector('.panel'); return pn ? pn.innerText : ''; });
  const done = p => p.waitForFunction(() => { const pn = document.getElementById('jaa-host').shadowRoot.querySelector('.panel.open'); return pn && pn.querySelector('.stats') && !pn.querySelector('.prog'); }, null, { timeout: 120000 });
  const open = async (path) => { const p = await ctx.newPage(); await p.goto('https://job-boards.greenhouse.io' + path); await p.waitForSelector('#jaa-host', { state: 'attached', timeout: 15000 }); return p; };
  const bank = () => sw.evaluate(async () => (await chrome.storage.local.get('answerBank')).answerBank);

  console.log('\n1) qwen3.5:4b-like model: slow load + <think> output + 1.5 s per batch');
  setCtl({ warmDelayMs: 3000, chatDelayMs: 1500, think: true });
  const t0 = Date.now();
  const p1 = await open('/mockco/jobs/200');
  await sleep(500);
  let lg = readLog();
  const warm = lg.find(x => x.path === '/api/generate');
  check(warm && warm.keep_alive === '30m' && warm.think === false, 'warm-up sent on page load, before Fill: ' + JSON.stringify(warm));
  await p1.locator('#jaa-host button.btn').click();
  const seen = new Set();
  const poll = setInterval(async () => { try { const t = await panel(p1); const m = t.match(/⏳ (.*)/); if (m) seen.add(m[1] + ' | ' + (t.match(/(\d+) by local AI/) || [])[1]); } catch (_) { } }, 150);
  await done(p1); clearInterval(poll);
  console.log('  progress seen:', JSON.stringify([...seen]));
  check([...seen].some(s => /Loading local model/.test(s)), 'showed "Loading local model…" while the warm-up finished');
  check([...seen].some(s => /batch [34]\/4.*\| [1-9]/.test(s)), 'progressive: AI answers were already on the page while later batches ran');
  lg = readLog();
  const chats = lg.filter(x => x.path === '/api/chat');
  check(chats.length === 4, `4 batches (6 short in 5+1, 3 essays in 2+1): ${chats.map(c => c.ids.length + (c.essay ? 'E' : 'S')).join(', ')}`);
  check(chats.every(c => c.think === false && c.format === 'json' && c.keep_alive === '30m' && c.options.num_ctx === 4096 && c.options.num_predict > 0), 'every chat: think:false, format json, keep_alive 30m, num_ctx 4096, num_predict ' + chats.map(c => c.options.num_predict).join('/'));
  check(!chats[0].essay && !chats[1].essay && chats[2].essay && chats[3].essay, 'short factual batches first, long answers last');
  check(chats[0].t > warm.t, 'first real call came after the warm-up');
  let t = await panel(p1);
  check(/9 by local AI/.test(t) && /1 from your saved answers/.test(t), '<think> blocks stripped; 9 AI answers + 1 from the bank ("preferred programming language" fuzzy-matched a saved answer): ' + (t.match(/\d+ by local AI/) || [])[0]);
  check(/I am excited/.test(await p1.inputValue('#e1')), 'essay drafted: ' + JSON.stringify((await p1.inputValue('#e1')).slice(0, 60)));
  console.log('  total', Date.now() - t0, 'ms');

  console.log('\n2) one batch times out: the others are kept, Retry fills the rest');
  setCtl({ chatDelayMs: 200, delayForChat: { 6: 6000 } }); // 2nd chat of this run (5 so far +1)
  await setSettings({ llmTimeoutSec: 3, llmFirstTimeoutSec: 30 });
  const p2 = await open('/mockco/jobs/201');
  await p2.locator('#jaa-host button.btn').click();
  await done(p2);
  t = await panel(p2);
  console.log('  panel:', JSON.stringify(t.split('\n').slice(2, 9).join(' | ')));
  check(/8 by local AI/.test(t) && /1 of 4 AI batches failed/.test(t), 'batch 2 timed out, batches 1,3,4 still filled (8 AI answers)');
  check(/Retry AI for remaining/.test(t), 'Retry button shown');
  check(/qwen2\.5:3b/.test(t), 'timeout message recommends qwen2.5:3b');
  setCtl({ chatDelayMs: 200 });
  await p2.evaluate(() => document.getElementById('jaa-host').shadowRoot.querySelector('[data-act="retry"]').click());
  await sleep(300); await done(p2);
  t = await panel(p2);
  check(/1 by local AI/.test(t) && readLog().filter(x => x.path === '/api/chat').slice(-1)[0].ids.length === 1, 'retry only asked for the 1 missing answer, kept everything else: ' + JSON.stringify(t.split('\n').slice(2, 8).join(' | ')));
  check(await p2.inputValue('#q5') === 'AI short answer', 'previously timed-out field now filled');

  console.log('\n3) every batch times out: stops after 2 and says to use qwen2.5:3b');
  setCtl({ chatDelayMs: 6000 });
  const n0 = readLog().filter(x => x.path === '/api/chat').length;
  const p3 = await open('/mockco/jobs/202');
  await p3.locator('#jaa-host button.btn').click();
  await done(p3);
  t = await panel(p3);
  const n1 = readLog().filter(x => x.path === '/api/chat').length;
  check((n1 - n0 === 3 || n1 - n0 === 2) && /Timeouts keep happening|qwen2\.5:3b/.test(t), `[n=${n1 - n0}; ${JSON.stringify((t.match(/Timeouts[^.]*\.|qwen[^.]*\./) || [""])[0])}] batch 1 ok (longer first-batch timeout), then gave up after 2 timed-out batches (${n1 - n0} requests, not 4; short ones may come from the v0.3 session answer cache) with advice`);

  console.log('\n4) model/server rejects "think" -> automatic retry without it');
  setCtl({ rejectThink: true, chatDelayMs: 100 });
  await setSettings({ llmTimeoutSec: 30 });
  const p4 = await open('/mockco/jobs/203');
  await p4.locator('#jaa-host button.btn').click();
  await done(p4);
  t = await panel(p4);
  lg = readLog();
  check(lg.some(x => x.rejected === 'think') && /9 by local AI/.test(t), 'filled after dropping "think": ' + (t.match(/\d+ by local AI/) || [])[0]);
  setCtl({ chatDelayMs: 100 });

  console.log('\n5) learning Alex\'s answers (on page 200 from step 1)');
  await p1.bringToFront();
  await p1.fill('#phone', '615-555-0100'); await p1.locator('#phone').blur();                  // yellow -> typed
  await p1.fill('#q4', 'Python'); await p1.locator('#q4').blur();                              // blue -> edited
  await p1.fill('#e1', 'I want to work at Mockco because performance work at Mockco scale is fun.'); await p1.locator('#e1').blur(); // company essay
  await p1.fill('#q7', 'Rex'); await p1.locator('#q7').blur();                                 // pet: never stored
  await sleep(2000);
  let b = await bank();
  const find = re => b.filter(x => re.test(x.q));
  check(find(/^Phone$/).length === 1 && find(/^Phone$/)[0].a === '615-555-0100' && find(/^Phone$/)[0].source === 'learned', 'yellow field learned: Phone -> 615-555-0100 (source learned)');
  check(find(/programming language/i).length === 1 && find(/programming language/i)[0].a === 'Python', 'fuzzy de-dupe: updated "What\'s your preferred programming language?" instead of adding a copy');
  const why = find(/\{company\}/);
  check(why.length === 1 && why[0].companySpecific && why[0].q === 'Why {company}?' && /\{company\}/.test(why[0].a), 'company essay stored as template: ' + JSON.stringify(why[0] && { q: why[0].q, a: why[0].a.slice(0, 50) }));
  check(!find(/pet/i).length, 'pet question never stored');
  check(!find(/Describe the most impressive|Additional Information|Kubernetes/i).length, 'unedited AI drafts not learned');
  // Save answers now + edit again (update, not duplicate)
  await p1.fill('#q4', 'Python, Go');
  const nBefore = b.length;
  await p1.evaluate(() => document.getElementById('jaa-host').shadowRoot.querySelector('[data-act="save"]').click());
  await sleep(800);
  b = await bank();
  check(b.length === nBefore && find(/programming language/i).length === 1 && b.find(x => /programming language/i.test(x.q)).a === 'Python, Go', '"Save answers now" updated the same entry');
  check(/Saved 1 answer/.test(await p1.evaluate(() => document.getElementById('jaa-toast-host').shadowRoot.innerHTML)), 'toast "Saved 1 answer"');
  // learned at Alex's submit
  await p1.fill('#q5', '6');
  await p1.click('#submit');
  await sleep(800);
  b = await bank();
  check(b.some(x => /years of Python/i.test(x.q) && x.a === '6'), 'answer captured at Alex\'s own Submit');

  console.log('\n6) next application uses the bank first; templates are AI context only (until opted in)');
  const n2 = readLog().length;
  const p5 = await open('/mockco/jobs/204');
  await p5.locator('#jaa-host button.btn').click();
  await done(p5);
  t = await panel(p5);
  check(await p5.inputValue('#phone') === '615-555-0100' && await p5.inputValue('#q4') === 'Python, Go', 'Phone + language filled from saved answers');
  check(/from your saved answers/.test(t), 'panel shows "from your saved answers": ' + (t.match(/\d+ from your saved answers/) || [])[0]);
  check(await p5.evaluate(() => document.getElementById('phone').classList.contains('jaa-ok')), 'saved-answer field is green');
  const essayReq = readLog().slice(n2).filter(x => x.path === '/api/chat' && x.essay);
  check(essayReq.some(x => /Why Mockco\?/.test(x.savedAnswers || '') && /another company/.test(x.savedAnswers || '')), 'company template passed to the model as context for essays');
  check(!/Mockco scale/.test(await p5.inputValue('#e1')), '"Why Mockco?" not auto-filled from the template (opt-in off)');
  await setSettings({ learnCompanySpecific: true });
  const p6 = await open('/mockco/jobs/205');
  await p6.locator('#jaa-host button.btn').click();
  await done(p6);
  check(/work at Mockco because performance work at Mockco scale/.test(await p6.inputValue('#e1')), 'opt-in on: template reused with {company} -> Mockco');

  console.log('\n7) Options: source/date shown, edit + delete');
  const o = await ctx.newPage();
  await o.goto(`chrome-extension://${extId}/options/options.html#bank`);
  await o.waitForTimeout(500);
  const rows = await o.locator('#bankRows tr').allInnerTexts();
  check(rows.some(r => /learned · Greenhouse · Mockco/.test(r)), 'learned rows show source/site/company/date');
  check(rows.some(r => /company-specific/.test(r)), 'company-specific tag shown');
  const idx = (await bank()).findIndex(x => x.q === 'Phone');
  await o.locator(`#bankRows button[data-del="${idx}"]`).click();
  await o.locator('#bankRows textarea[data-k="a"]').first().fill('Yes (edited)');
  await o.click('#save'); await o.waitForTimeout(400);
  b = await bank();
  check(!b.some(x => x.q === 'Phone') && b[0].a === 'Yes (edited)', 'delete + edit saved');
  await o.screenshot({ path: '/workspace/jaa-tests/options-bank.png', fullPage: true });
  await ctx.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('E2E ERROR', e); process.exit(2); });
