// v0.3 multi-step / multi-page: SPA steps (Greenhouse-like), Workday page navigation, LinkedIn Easy Apply modal.
// Alex's clicks on Next are simulated with real (trusted) Playwright clicks; the extension must never click Next/Submit.
const L = require('./v3-lib');
const { check, sleep, waitChat, chatText } = L;
const stepHeader = p => p.evaluate(() => { const r = document.getElementById('jaa-host'); const e = r && r.shadowRoot.querySelector('.step'); return e ? e.innerText + ' | ' + (e.getAttribute('style') || '') + ' | ' + getComputedStyle(e).display : ''; });
const btn = p => p.locator('#jaa-host .btn');

(async () => {
  let { ctx, sw, store, setSettings, realHits } = await L.launch();
  let p = await ctx.newPage();

  console.log('\n1) SPA steps with "Step N of 3" + progress bar');
  await p.goto('https://job-boards.greenhouse.io/mockco/jobs/300');
  await btn(p).waitFor({ timeout: 15000 });
  await btn(p).click();
  await p.waitForFunction(() => document.getElementById('email').value, null, { timeout: 60000 });
  await waitChat(p, /filled|need you/i, 30000); await sleep(800);
  check(await p.inputValue('#first_name') === 'Alex' && await p.inputValue('#email') === 'alex.morgan@example.com', 'step 1 filled from the profile');
  check(/Step 1 of 3/.test(await stepHeader(p)), 'chat header shows step progress: ' + (await stepHeader(p)).split('|')[0].trim());
  await sleep(1200);
  let sess = Object.values((await store('sessions')).sessions || {}).find(s => /mockco:300/.test(s.key));
  check(sess && sess.active && sess.order.length === 1, 'session started for this job: ' + (sess && sess.key));
  await p.click('#next'); // Alex presses Next himself
  await p.waitForFunction(() => document.getElementById('auth') && document.getElementById('auth').value === 'Yes', null, { timeout: 60000 });
  await waitChat(p, /Step 2 of 3: filled \d+, need \d+/, 30000);
  check(true, 'new SPA step detected and auto-filled; chat says "Step 2 of 3: filled X, need Y"');
  check(/Step 2 of 3/.test(await stepHeader(p)), 'header progress moved to step 2');
  await p.waitForFunction(() => document.getElementById('why').value.length > 20, null, { timeout: 60000 });
  check(true, 'essay on step 2 drafted by the (mock) local AI');
  await p.click('#next');
  await waitChat(p, /Step 3 of 3: filled \d+, need \d+/, 60000);
  check(['', 'Male', 'Decline to self-identify'].includes(await p.inputValue('#gender')), 'EEO on step 3 only from Alex\'s own saved EEO answer (profile): ' + JSON.stringify(await p.inputValue('#gender')));
  await sleep(1200);
  sess = Object.values((await store('sessions')).sessions || {}).find(s => /mockco:300/.test(s.key));
  check(sess && sess.order.length === 3, 'session persisted all 3 steps: ' + (sess && sess.order.join(',')));
  check(sess && !JSON.stringify(sess).includes('Male') && !/Female/.test(JSON.stringify(sess.steps)), 'no EEO values recorded in the session');
  await p.locator('#jaa-host [data-h="review"]').click();
  await waitChat(p, /\(recorded\)/i, 8000);
  const t = await chatText(p);
  check(/Contact|Step 1/.test(t) && /Phone|Email/.test(t) && /Step 2/.test(t), 'review covers earlier steps\' recorded answers');
  await p.screenshot({ path: L.SHOTS + '/10-multistep-review.png' });
  check((await p.evaluate(() => window.__nextClicks)).length === 2 && (await p.evaluate(() => window.__nextClicks)).every(Boolean), 'Next pressed only twice, both trusted (Alex), never by the extension');
  check(!(await p.evaluate(() => /Thank you for applying/.test(document.body.innerText))), 'never submitted');

  console.log('\n2) Workday: sign-in page left to Alex, then page-navigation steps with progressBar');
  const wd = 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Nashville/Software-Engineer_JR12345/apply';
  await p.goto(wd);
  await sleep(4000);
  const wdBtn = await btn(p).count() ? await btn(p).isVisible() : false;
  if (wdBtn) { await btn(p).click(); await sleep(2500); }
  check(await p.inputValue('#em') === '' && await p.inputValue('#pw') === '', 'account / sign-in page: nothing filled (left to Alex)' + (wdBtn ? '' : ', no button shown'));
  if (wdBtn) check(/account|sign.?in/i.test(await chatText(p) + await p.evaluate(() => document.getElementById('jaa-host').shadowRoot.textContent)), 'chat explains that account pages are left to Alex');
  await p.goto(wd + '/step1');
  await btn(p).waitFor({ timeout: 15000 });
  await btn(p).click();
  await p.waitForFunction(() => document.getElementById('email').value, null, { timeout: 60000 });
  check(await p.inputValue('#legalNameSection_firstName') === 'Alex', 'Workday step 1 text fields filled (data-automation-id)');
  await sleep(1500);
  const src = await p.textContent('[data-automation-id="source"]');
  check(/LinkedIn|Indeed|Referral|Other|Select One/.test(src), 'Workday listbutton handled: "' + src.trim() + '"');
  check(/Step 1 of 3/.test(await stepHeader(p)), 'header shows Workday step 1 of 3');
  await p.click('#next'); // full page navigation, by Alex
  await p.waitForURL(/step2$/);
  await waitChat(p, /Step 2 of 3: filled \d+, need \d+/, 60000).catch(() => {});
  const t2 = await chatText(p);
  check(/Step 2 of 3: filled \d+, need \d+/.test(t2), 'after page navigation the session continued and auto-filled step 2');
  check(/^(Yes|No)$/.test((await p.textContent('[data-automation-id="auth"]')).trim()), 'listbutton on step 2 set: ' + (await p.textContent('[data-automation-id="auth"]')).trim());
  await p.screenshot({ path: L.SHOTS + '/11-workday-step2.png' });
  check(JSON.parse(await p.evaluate(() => sessionStorage.getItem('nextTrusted') || '[]')).every(Boolean), 'Workday "Save and Continue" only pressed by Alex (trusted)');

  console.log('\n3) LinkedIn Easy Apply modal (fill-only)');
  await p.goto('https://www.linkedin.com/jobs/view/4012345678/');
  await sleep(3500);
  check(!(await btn(p).count()) || !(await btn(p).isVisible()), 'no button before Easy Apply is opened');
  await p.click('#easy');
  await btn(p).waitFor({ timeout: 15000 });
  await btn(p).click();
  await p.waitForFunction(() => document.getElementById('li-first') && document.getElementById('li-first').value === 'Alex', null, { timeout: 60000 });
  check(true, 'modal step 1 filled');
  await p.click('#li-next');
  await waitChat(p, /Step 2|50% done/, 60000);
  await p.waitForFunction(() => document.getElementById('li-auth') && document.getElementById('li-auth').value === 'Yes', null, { timeout: 30000 }).catch(() => {});
  check(await p.inputValue('#li-auth') === 'Yes', 'modal step 2 auto-filled after Alex pressed Next');
  check(!(await p.evaluate(() => /application was sent/.test(document.body.innerText))) && (await p.evaluate(() => window.__nextClicks)).every(Boolean), 'LinkedIn: never pressed Next / Submit');
  await p.screenshot({ path: L.SHOTS + '/12-linkedin-modal.png' });

  console.log('\n4) "Auto-fill next steps" off: new steps only get a badge');
  await setSettings({ autoFillSteps: false });
  await p.goto('https://job-boards.greenhouse.io/mockco/jobs/300?x=2');
  await btn(p).waitFor({ timeout: 15000 });
  await btn(p).click();
  await p.waitForFunction(() => document.getElementById('email').value, null, { timeout: 60000 });
  await sleep(800);
  await p.click('#next');
  await sleep(4000);
  check(await p.inputValue('#auth') === '' && await p.inputValue('#yrs') === '', 'step 2 not filled automatically when the setting is off');
  check(/need|step/i.test(await p.evaluate(() => document.getElementById('jaa-host').shadowRoot.textContent)), 'Alex is told a new step is there');

  check(realHits.length === 0, 'no request reached a real job site: ' + JSON.stringify(realHits));
  await ctx.close();
  console.log(L.done() ? '\nFAILURES: ' + L.done() : '\nALL PASS');
  process.exit(L.done() ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
