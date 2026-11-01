// v0.6.8 end to end (fake person, local mock pages, no network).
// (1) Ashby: the resume goes into the Resume field (hidden input), never the "Autofill from resume" box, both
//     on the built-in host (floating button) and on a site that isn't built in (toolbar popup).
// (2) Tracker company / title come from the page (JSON-LD, og:site_name, the title's pattern), not the
//     hostname: no "localhost" rows.
// Needs Chromium's --enable-unsafe-extension-debugging (CDP Extensions.triggerAction). Run under
// `unshare -rn sh -c 'ip link set lo up && node e2e-v068.js'` if a real local AI server holds :11434.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const EXT = path.resolve(__dirname, '..');
const SHOTS = process.env.V068_SHOTS || '/tmp/v068-shots';
fs.mkdirSync(SHOTS, { recursive: true });
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; return c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const LD_PAGE = read('anysite-mocks/plain-apply.html')
  .replace(/<title>[^<]*<\/title>/, '<title>Apply</title>')
  .replace('</head>', '<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Field Support Technician","hiringOrganization":{"@type":"Organization","name":"Northwind Example"}}</script></head>');
const PAGES = {
  'https://jobs.ashbyhq.com/acme/5678/application': read('mocks/ashby.html'),
  'http://localhost:8799/ashby-copy/application': read('mocks/ashby.html'),
  'http://localhost:8799/jobs/support-engineer/apply': read('anysite-mocks/plain-apply.html'),
  'http://localhost:8799/jobs/lever-copy/apply': read('mocks/lever.html'),
  'https://careers.northwind-example.test/jobs/42/apply': LD_PAGE
};
const PROFILE = {
  firstName: 'Casey', lastName: 'Morgan', email: 'casey.morgan@example.com', phone: '(555) 010-0177', city: 'Lakeview', state: 'OR', location: 'Lakeview, OR',
  workAuthorizedUS: 'Yes', needsSponsorship: 'No', over18: 'Yes',
  workHistory: [{ title: 'IT Support Specialist', company: 'Bluefin Devices', start: 'Mar 2021', end: 'Present', bullets: [] }]
};

(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-v068-' + Date.now(), {
    channel: 'chromium', headless: true, viewport: { width: 1180, height: 860 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--enable-unsafe-extension-debugging']
  });
  const net = [];
  await ctx.route(/^https?:\/\//, r => {
    const u = r.request().url().split('#')[0];
    if (PAGES[u] && r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'text/html', body: PAGES[u] });
    if (/favicon/.test(u)) return r.fulfill({ status: 404, body: '' });
    if (/^http:\/\/(127\.0\.0\.1|localhost):11434\//.test(u)) return r.fulfill({ status: 503, body: 'no local AI in this test' });
    net.push(r.request().method() + ' ' + u); return r.fulfill({ status: 404, body: 'blocked' });
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('dataVersion')).dataVersion >= 5) return; await new Promise(r => setTimeout(r, 50)); } });
  for (const p of ctx.pages()) if (/welcome\.html/.test(p.url())) await p.close();
  const pdf = fs.readFileSync(path.join(__dirname, 'fixtures', 'casey-morgan-resume.pdf')).toString('base64');
  await sw.evaluate(async ([P, pdf]) => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ profile: Object.assign(JAA.merge(JAA.EMPTY_PROFILE, {}), P), onboarding: { done: true }, uiPrefs: { privacySeen: true }, tour: { done: true },
      resume: { name: 'casey-morgan-resume.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,' + pdf, size: pdf.length },
      settings: Object.assign({}, settings, { useLLM: false, warmUp: false, panelAuto: 'manual' }) });
  }, [PROFILE, pdf]);

  const bcdp = await ctx.browser().newBrowserCDPSession();
  let msgN = 0; const waiting = {};
  bcdp.on('Target.receivedMessageFromTarget', e => { const m = JSON.parse(e.message); if (m.id && waiting[m.id]) { waiting[m.id](m); delete waiting[m.id]; } });
  async function popupFill(page) {
    await page.bringToFront();
    for (const t of (await bcdp.send('Target.getTargets')).targetInfos) if (t.type === 'page' && /popup\/popup\.html/.test(t.url)) await bcdp.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
    const tab = (await bcdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })).targetInfos.find(t => t.url === page.url());
    await bcdp.send('Extensions.triggerAction', { id: extId, targetId: tab.targetId });
    let pop; for (let i = 0; i < 50 && !pop; i++) { await sleep(100); pop = (await bcdp.send('Target.getTargets')).targetInfos.find(t => t.type === 'page' && /popup\/popup\.html/.test(t.url)); }
    const { sessionId } = await bcdp.send('Target.attachToTarget', { targetId: pop.targetId, flatten: false });
    const call = (method, params) => new Promise(res => { const id = ++msgN; waiting[id] = res; bcdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }); });
    const ev = async expression => { const m = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return m.result && m.result.result ? m.result.result.value : undefined; };
    for (let i = 0; i < 60 && !(await ev('document.readyState === "complete" && !!document.getElementById("site").textContent')); i++) await sleep(150);
    await ev("document.getElementById('fill').click()");
    for (let i = 0; i < 200 && !(await ev("/filled|bad/.test(document.getElementById('result').innerHTML)")); i++) await sleep(150);
    return ev("document.getElementById('result').innerText");
  }
  async function buttonFill(page) {
    await page.waitForSelector('#jaa-host .btn', { timeout: 15000 });
    await page.locator('#jaa-host .btn').click();
    await page.waitForFunction(() => /(Required|Optional) \d+ of \d+/.test(document.getElementById('jaa-host').shadowRoot.querySelector('.body').innerText), null, { timeout: 30000 });
    await sleep(800);
  }
  const files = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('input[type=file]')].map(i => [i.id, i.files[0] ? i.files[0].name : ''])));

  console.log('\n(1a) Ashby, built-in host: resume in the Resume field');
  const a1 = await ctx.newPage(); await a1.goto('https://jobs.ashbyhq.com/acme/5678/application');
  await buttonFill(a1);
  let f = await files(a1);
  check(f._systemfield_resume === 'casey-morgan-resume.pdf', 'Resume field (hidden input) has the resume: ' + JSON.stringify(f));
  check(f['autofill-file'] === '', '"Autofill from resume" box left alone');
  check(await a1.evaluate(() => !!window.__submitted) === false, 'nothing submitted');

  console.log('\n(1b) Ashby-style form on a site that isn\'t built in (toolbar popup)');
  const a2 = await ctx.newPage(); await a2.goto('http://localhost:8799/ashby-copy/application');
  await popupFill(a2);
  f = await files(a2);
  check(f._systemfield_resume === 'casey-morgan-resume.pdf' && f['autofill-file'] === '', 'resume in the Resume field, not the autofill box: ' + JSON.stringify(f));

  console.log('\n(2) tracker company / title from the page');
  const p1 = await ctx.newPage(); await p1.goto('http://localhost:8799/jobs/support-engineer/apply'); await popupFill(p1);
  const p2 = await ctx.newPage(); await p2.goto('http://localhost:8799/jobs/lever-copy/apply'); await popupFill(p2);
  const p3 = await ctx.newPage(); await p3.goto('https://careers.northwind-example.test/jobs/42/apply'); await popupFill(p3);
  await sleep(800);
  const apps = await sw.evaluate(async () => ((await chrome.storage.local.get('applications')).applications || []).map(a => ({ company: a.company, title: a.title, url: a.url })));
  const row = re => apps.find(a => re.test(a.url)) || {};
  console.log('    tracker: ' + apps.map(a => `${a.company || '∅'} / ${a.title || '∅'}`).join(' ; '));
  check(!apps.some(a => /localhost|^\d+\.\d+/.test(a.company || '')), 'no row uses the hostname ("localhost") as the company');
  check(row(/ashbyhq/).company === 'Acme' && row(/ashbyhq/).title === 'Product Engineer', 'Ashby built-in: Acme / Product Engineer');
  check(row(/ashby-copy/).company === 'Acme' && row(/ashby-copy/).title === 'Product Engineer', '"Product Engineer @ Acme" page: Acme / Product Engineer');
  check(row(/support-engineer/).company === 'Example Company' && row(/support-engineer/).title === 'Support Engineer', '"Support Engineer · Example Company Careers": Example Company / Support Engineer');
  check(row(/lever-copy/).company === 'Acme' && row(/lever-copy/).title === 'Data Analyst', '"Acme - Data Analyst": Acme / Data Analyst');
  check(row(/northwind/).company === 'Northwind Example' && row(/northwind/).title === 'Field Support Technician', 'JSON-LD JobPosting: Northwind Example / Field Support Technician');
  check(!net.length, 'no other network requests: ' + (net.join(', ') || 'none'));
  await ctx.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
