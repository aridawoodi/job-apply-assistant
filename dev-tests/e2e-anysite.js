// v0.6.7 any site, end to end (fake person, local mock pages, no network):
// (a) one click from the real toolbar popup (Extensions.triggerAction grants activeTab, like a click) on
//     sites that aren't built in: a plain careers page, an aria/custom-dropdown hosted form, a web-components
//     form (open shadow roots), a form inside an iframe; a contact form gets no "always allow" offer;
// (b) "Allow on this site" -> registered content script -> Fill button appears by itself after reload, not
//     on a non-application page of that site -> Remove in Options -> gone;
// (c) built-in sites unaffected. Screenshots: /workspace/any-site/ (override with ANY_SHOTS).
// Needs Chromium's --enable-unsafe-extension-debugging (CDP Extensions.triggerAction). Fake data only.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const EXT = path.resolve(__dirname, '..');
const M = path.join(__dirname, 'anysite-mocks');
const SHOTS = process.env.ANY_SHOTS || '/workspace/any-site';
fs.mkdirSync(SHOTS, { recursive: true });
const html = f => fs.readFileSync(path.join(M, f), 'utf8');
const lever = fs.readFileSync(path.join(__dirname, 'v5-mocks', 'lever-exp.html'), 'utf8');
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; return c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PAGES = {
  'https://careers.example-company.test/jobs/support-engineer/apply': 'plain-apply.html',
  'https://apply.example-hire.test/example-company/data-analyst': 'ats-aria.html',
  'https://jobs.example-shadow.test/product-designer/apply': 'ats-shadow.html',
  'https://careers.example-company.test/support-specialist': 'ats-iframe.html',
  'https://careers.example-company.test/embed/apply-form.html': 'embed-form.html',
  'https://www.example-company.test/contact': 'contact.html',
  'http://localhost:8799/jobs/apply': 'plain-apply.html',
  'http://localhost:8799/contact': 'contact.html'
};
const PROFILE = {
  firstName: 'Riley', lastName: 'Chen', email: 'riley.chen@example.com', phone: '(555) 010-0142', city: 'Lakeview', state: 'OR', location: 'Lakeview, OR',
  linkedin: 'https://www.linkedin.com/in/riley-chen-example', workAuthorizedUS: 'Yes', needsSponsorship: 'No', over18: 'Yes',
  workHistory: [{ title: 'Support Engineer', company: 'Bluefin Devices', start: 'Mar 2021', end: 'Present', bullets: [] }],
  eeo: { gender: "I don't wish to answer" }
};

(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-any-' + Date.now(), {
    channel: 'chromium', headless: true, viewport: { width: 1180, height: 860 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--enable-unsafe-extension-debugging']
  });
  const net = [];
  await ctx.route(/^https?:\/\//, r => {
    const u = r.request().url().split('#')[0];
    if (PAGES[u]) return r.fulfill({ status: 200, contentType: 'text/html', body: html(PAGES[u]) });
    if (/^https:\/\/jobs\.lever\.co\//.test(u)) return r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'text/html', body: lever }) : r.fulfill({ status: 200, body: 'ok' });
    if (/favicon/.test(u)) return r.fulfill({ status: 404, body: '' });
    if (/^http:\/\/(127\.0\.0\.1|localhost):11434\//.test(u)) return r.fulfill({ status: 503, body: 'no local AI in this test' }); // the extension's own local-AI checks
    net.push(u); return r.fulfill({ status: 404, body: 'blocked' });
  });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const X = p => `chrome-extension://${extId}/${p}`;
  await sw.evaluate(async () => { for (let i = 0; i < 100; i++) { if ((await chrome.storage.local.get('dataVersion')).dataVersion >= 5) return; await new Promise(r => setTimeout(r, 50)); } });
  for (const p of ctx.pages()) if (/welcome\.html/.test(p.url())) await p.close();
  await sw.evaluate(async P => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ profile: P, onboarding: { done: true }, uiPrefs: { privacySeen: true }, tour: { done: true }, settings: Object.assign({}, settings, { useLLM: false, warmUp: false, panelAuto: 'off' }) });
  }, PROFILE);
  const permsBefore = await sw.evaluate(() => chrome.permissions.getAll());

  /* ---- the real toolbar popup, opened on a tab the way a click does (grants activeTab) ---- */
  const bcdp = await ctx.browser().newBrowserCDPSession();
  let msgN = 0; const waiting = {};
  bcdp.on('Target.receivedMessageFromTarget', e => { const m = JSON.parse(e.message); if (m.id && waiting[m.id]) { waiting[m.id](m); delete waiting[m.id]; } });
  async function openPopup(page) {
    await page.bringToFront();
    for (const t of (await bcdp.send('Target.getTargets')).targetInfos) if (t.type === 'page' && /popup\/popup\.html/.test(t.url)) await bcdp.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
    const tab = (await bcdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })).targetInfos.find(t => t.url === page.url());
    await bcdp.send('Extensions.triggerAction', { id: extId, targetId: tab.targetId });
    let pop; for (let i = 0; i < 50 && !pop; i++) { await sleep(100); pop = (await bcdp.send('Target.getTargets')).targetInfos.find(t => t.type === 'page' && /popup\/popup\.html/.test(t.url)); }
    const { sessionId } = await bcdp.send('Target.attachToTarget', { targetId: pop.targetId, flatten: false });
    const call = (method, params) => new Promise(res => { const id = ++msgN; waiting[id] = res; bcdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }); });
    const ev = async (expression, gesture) => { const m = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: !!gesture }); if (m.result && m.result.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 300)); return m.result.result.value; };
    const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { if (await ev(expr).catch(() => false)) return true; await sleep(150); } return false; };
    const shot = async file => { await ev(`(() => { const c = document.getElementById('siteCard'); if (!c || c.hidden) return; let n = c.nextElementSibling; while (n) { n.style.display = 'none'; n = n.nextElementSibling; } })()`); const h = await ev('Math.ceil(document.body.scrollHeight)'); await call('Emulation.setDeviceMetricsOverride', { width: 320, height: Math.min(h, 590), deviceScaleFactor: 2, mobile: false }); await sleep(150); const m = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(m.result.data, 'base64')); };
    await waitFor('document.readyState === "complete" && !!document.getElementById("site").textContent');
    return { ev, waitFor, shot };
  }
  const fillFromPopup = async pop => { await pop.ev("document.getElementById('fill').click()"); await pop.waitFor("/filled|bad/.test(document.getElementById('result').innerHTML)", 30000); return pop.ev("document.getElementById('result').innerText"); };

  console.log('\n(a1) plain careers page on a site that is not built in: one click from the popup');
  const pg = await ctx.newPage();
  await pg.goto('https://careers.example-company.test/jobs/support-engineer/apply');
  await sleep(1500);
  check(await pg.locator('#jaa-host').count() === 0, 'no Fill button by itself (no access to this site yet)');
  let pop = await openPopup(pg);
  check(await pop.ev("document.getElementById('site').textContent") === 'careers.example-company.test' && /most application forms/.test(await pop.ev("document.getElementById('note').textContent")), 'popup names the site: ' + await pop.ev("document.getElementById('site').textContent"));
  check(await pop.waitFor("!document.getElementById('siteCard').hidden", 6000), 'popup offers "Use on careers.example-company.test automatically?" (page looks like an application)');
  check(await pop.ev('siteOffer.origin') === 'https://careers.example-company.test/*', 'it would ask for this one site only: ' + await pop.ev('siteOffer.origin'));
  check(await pop.ev("getComputedStyle(document.getElementById('generic')).display") === 'none', 'no separate "generic fill" button: Fill just works');
  await pop.shot(path.join(SHOTS, 'popup-allow-card.png'));
  await pg.screenshot({ path: path.join(SHOTS, 'generic-before.png'), fullPage: true });
  let res = await fillFromPopup(pop);
  const v1 = await pg.evaluate(() => ({ fn: fn.value, ln: ln.value, em: em.value, ph: ph.value, loc: loc.value, li: li.value, emp: emp.value, auth: (document.querySelector('[name=auth]:checked') || {}).value, spon: spon.value, g: g.value, vet: vet.value, sub: window.__submitted || 0 }));
  check(v1.fn === 'Riley' && v1.ln === 'Chen' && v1.em === 'riley.chen@example.com' && /555/.test(v1.ph), 'contact details filled: ' + [v1.fn, v1.ln, v1.em, v1.ph].join(', '));
  check(v1.li === PROFILE.linkedin && v1.emp === 'Bluefin Devices' && /Lakeview/.test(v1.loc), 'LinkedIn, current employer, location: ' + [v1.emp, v1.loc].join(' · '));
  check(v1.auth === 'yes' && v1.spon === 'No', 'Yes/No: authorized (radio fieldset) = yes, sponsorship (select) = No');
  check(v1.g === "I don't wish to answer" && v1.vet === '', 'EEO: only what the profile says (gender), veteran left empty');
  check(v1.sub === 0, 'never submitted');
  check(/filled/.test(res), 'popup result: ' + res.replace(/\s+/g, ' ').slice(0, 90));
  await pg.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
  await pg.screenshot({ path: path.join(SHOTS, 'generic-after.png'), fullPage: true });
  // second Fill: no double injection
  res = await fillFromPopup(pop);
  const inj = await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); const r = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => [!!window.__JAA_MAIN__, document.querySelectorAll('#jaa-host').length] }).catch(e => [{ result: e.message }]); return r[0].result; });
  check(Array.isArray(inj) && inj[1] === 1, 'second Fill reuses the injected bundle (one panel on the page): ' + JSON.stringify(inj));

  console.log('\n(a2) hosted form: aria-labelledby, placeholders, autocomplete, radiogroup, custom listbox, a Next button');
  const pa = await ctx.newPage(); await pa.goto('https://apply.example-hire.test/example-company/data-analyst');
  pop = await openPopup(pa); res = await fillFromPopup(pop);
  const v2 = await pa.evaluate(() => { const q = n => document.querySelector(n); return { f: q('[name="candidate[first_name]"]').value, l: q('[name="candidate[last_name]"]').value, e: q('[name="candidate[email]"]').value, p: q('[name="candidate[phone]"]').value, c: q('[name=candidateCity]').value, auth: (q('[name=q_auth]:checked') || {}).value, spon: q('#spon').dataset.value || '', next: window.__next || 0, sub: window.__submitted || 0 }; });
  check(v2.f === 'Riley' && v2.l === 'Chen', 'aria-labelledby "Given name / Family name": ' + v2.f + ' ' + v2.l);
  check(v2.e === 'riley.chen@example.com' && /555/.test(v2.p), 'placeholder-only email, autocomplete=tel phone');
  check(v2.c === 'Lakeview', 'autocomplete=address-level2 (no label) -> city: ' + v2.c);
  check(v2.auth === '1', 'role=radiogroup Yes/No: Yes');
  check(v2.spon === 'No', 'custom listbox dropdown (button aria-haspopup=listbox): ' + (v2.spon || '(empty)'));
  check(v2.next === 0 && v2.sub === 0, 'never pressed Next or Submit');

  console.log('\n(a3) web-components form (fields inside open shadow roots)');
  const ps = await ctx.newPage(); await ps.goto('https://jobs.example-shadow.test/product-designer/apply');
  pop = await openPopup(ps); res = await fillFromPopup(pop);
  const v3 = await ps.evaluate(() => Object.fromEntries([...document.querySelectorAll('x-field')].map(x => [x.getAttribute('name'), (x.shadowRoot.querySelector('input,textarea') || {}).value || ''])));
  check(v3.firstName === 'Riley' && v3.lastName === 'Chen' && v3.email === 'riley.chen@example.com' && /555/.test(v3.phone) && v3.linkedin === PROFILE.linkedin, 'shadow DOM fields filled: ' + JSON.stringify(v3));

  console.log('\n(a4) application form inside an iframe (same site)');
  const pf = await ctx.newPage(); await pf.goto('https://careers.example-company.test/support-specialist');
  await pf.frameLocator('#apply-frame').locator('#a1').waitFor();
  pop = await openPopup(pf); res = await fillFromPopup(pop);
  const fr = pf.frames().find(f => /apply-form/.test(f.url()));
  const v4 = await fr.evaluate(() => ({ f: a1.value, l: a2.value, e: a3.value, p: a4.value, age: a6.value, sub: window.__submitted || 0 }));
  check(v4.f === 'Riley' && v4.e === 'riley.chen@example.com' && /555/.test(v4.p) && v4.age === 'Yes', 'filled inside the iframe: ' + JSON.stringify(v4));
  check(/filled/.test(res), 'popup result from the iframe: ' + res.replace(/\s+/g, ' ').slice(0, 80));

  console.log('\n(a5) a contact form is not a job application');
  const pc = await ctx.newPage(); await pc.goto('https://www.example-company.test/contact');
  pop = await openPopup(pc); await sleep(1500);
  check(await pop.ev("document.getElementById('siteCard').hidden") === true, 'no "always allow" offer on a contact page');
  res = await fillFromPopup(pop);
  check(await pc.evaluate(() => c1.value === 'Riley Chen' && c2.value === 'riley.chen@example.com'), 'manual Fill from the popup still works there if you want it: ' + res.replace(/\s+/g, ' ').slice(0, 60));

  console.log('\n(b) "Allow on this site" -> Fill button appears by itself; Remove in Options -> gone');
  const pl = await ctx.newPage(); await pl.goto('http://localhost:8799/jobs/apply'); await sleep(2500);
  check(await pl.locator('#jaa-host').count() === 0, 'before: no Fill button by itself on localhost:8799');
  pop = await openPopup(pl);
  check(await pop.waitFor("!document.getElementById('siteCard').hidden", 6000), 'offer shown for localhost');
  // localhost is already a required host (the local AI), so Chrome grants it without a prompt; for any other
  // site Chrome shows its own confirmation, which a headless test can't click.
  await pop.ev("document.getElementById('scAllow').click()", true);
  check(await pop.waitFor("!document.getElementById('siteOn').hidden", 8000), 'popup: "Automatic on this site"');
  const reg = await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts());
  check(reg.length === 1 && reg[0].id === 'jaa-user-sites' && JSON.stringify(reg[0].matches) === '["http://localhost/*"]' && reg[0].persistAcrossSessions && reg[0].allFrames, 'content script registered for this site only: ' + JSON.stringify(reg.map(r => r.matches)));
  check(((await sw.evaluate(() => chrome.storage.local.get('userSites'))).userSites || []).map(s => s.origin).join() === 'http://localhost/*', 'saved in the allowed-sites list');
  await pl.reload(); 
  check(await pl.waitForSelector('#jaa-host .btn', { timeout: 15000 }).then(() => true, () => false), 'after reload: the Fill button appears by itself (looks like an application)');
  const pl2 = await ctx.newPage(); await pl2.goto('http://localhost:8799/contact'); await sleep(6000);
  const loaded = await sw.evaluate(async () => { const ts = await chrome.tabs.query({}); const t = ts.find(x => /localhost:8799\/contact/.test(x.url || '')); const r = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => !!window.__JAA_MAIN__ }); return r[0].result; });
  check(loaded && await pl2.locator('#jaa-host').count() === 0, 'contact page on the same site: script is there, but no Fill button (not an application)');
  await sw.evaluate(() => syncSiteScripts()); // the same re-sync that runs on browser start / install / permission changes
  check((await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length === 1, 're-sync keeps exactly one registration');
  const opt = await ctx.newPage(); await opt.goto(X('options/options.html#sites'));
  await opt.waitForSelector('#sitesUser li');
  const rows = await opt.$$eval('#sitesUser li', ls => ls.map(l => l.innerText.replace(/\s+/g, ' ')));
  const ro = await opt.$$eval('#sitesBuiltIn li', ls => ls.length);
  check(rows.length === 1 && /localhost/.test(rows[0]) && /Automatic/.test(rows[0]) && ro === 7, `Options → Sites: 1 allowed (${rows[0]}), ${ro} built in`);
  await opt.evaluate(() => document.getElementById('sites').scrollIntoView()); await sleep(300);
  await opt.locator('#sites').screenshot({ path: path.join(SHOTS, 'options-sites.png') });
  await opt.locator('#sitesUser li button', { hasText: 'Remove' }).click();
  await opt.waitForFunction(() => document.querySelectorAll('#sitesUser li').length === 0 && !document.getElementById('sitesEmpty').hidden);
  check(true, 'Remove: list empty, "None yet" shown');
  check((await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length === 0, 'content script unregistered');
  await pl.reload(); await sleep(4000);
  check(await pl.locator('#jaa-host').count() === 0, 'after Remove + reload: no Fill button by itself');
  await opt.locator('#sites').screenshot({ path: path.join(SHOTS, 'options-sites-empty.png') });

  console.log('\n(c) built-in sites are unaffected');
  const pb = await ctx.newPage(); await pb.goto('https://jobs.lever.co/examplelabs/support-lead/apply', { waitUntil: 'domcontentloaded' });
  check(await pb.waitForSelector('#jaa-host .btn', { timeout: 15000 }).then(() => true, () => false), 'Lever (built in): Fill button appears by itself as before');
  pop = await openPopup(pb); await sleep(1200);
  check(await pop.ev("document.getElementById('site').textContent") === 'Lever' && await pop.ev("document.getElementById('siteCard').hidden") && await pop.ev("document.getElementById('siteOn').hidden"), 'popup on a built-in site: no site-access card');
  const permsAfter = await sw.evaluate(() => chrome.permissions.getAll());
  check(JSON.stringify(permsAfter.origins.sort()) === JSON.stringify(permsBefore.origins.sort()), 'granted host access is back to exactly the built-in list: ' + permsAfter.origins.length + ' origins');
  check(net.length === 0, 'no request left the test (all pages are local mocks): ' + net.slice(0, 3).join(', '));

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
  await ctx.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
