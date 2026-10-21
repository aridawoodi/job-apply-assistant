// v0.3 chat assistant, review, submit warning, history, settings link, backups, icon/UI.
const L = require('./v3-lib');
const { check, sleep, chatText, waitChat, lastCard, SHOTS } = L;

(async () => {
  L.setCtl({ chatDelayMs: 300, chunkMs: 25, think: true });
  const { ctx, sw, extId, store, realHits } = await L.launch();
  const p = await ctx.newPage();
  await p.goto('https://job-boards.greenhouse.io/mockco/jobs/400');
  await p.waitForSelector('#jaa-host .btn', { timeout: 20000 });

  console.log('\n1) floating button: bigger, icon, pulse on first appearance');
  const b = await p.evaluate(() => { const r = document.getElementById('jaa-host').shadowRoot; const btn = r.querySelector('.btn'); const cs = getComputedStyle(btn); return { text: btn.innerText, svg: !!btn.querySelector('svg'), pulse: btn.classList.contains('pulse'), anim: cs.animationName, h: btn.getBoundingClientRect().height, font: cs.fontSize }; });
  check(/Fill application/.test(b.text) && b.svg, 'button shows the new icon + "⚡ Fill application": ' + JSON.stringify(b.text));
  check(b.pulse && b.anim === 'jaapulse', 'pulses on first appearance');
  check(b.h >= 44 && parseFloat(b.font) >= 15, `bigger: ${Math.round(b.h)}px tall, ${b.font} font`);
  await p.screenshot({ path: SHOTS + '/1-floating-button.png' });

  console.log('\n2) chat: greet, fill, report, then ask one question at a time');
  await p.locator('#jaa-host .btn').click();
  await waitChat(p, /Hi Alex/, 10000);
  await waitChat(p, /Needs you/i, 60000);
  let t = await chatText(p);
  check(/I never press Submit, Next or Continue/.test(t), 'greeting says it never presses Submit/Next');
  check(/filled/.test(t) && /by local AI/.test(t) && /need you/.test(t), 'fill results reported in chat');
  const q1 = await lastCard(p).innerText();
  check(/Phone/.test(q1) && await lastCard(p).locator('input').count() === 1, 'first question: Phone, with a text box');
  const pulseAfter = await p.evaluate(() => document.getElementById('jaa-host').shadowRoot.querySelector('.btn').classList.contains('pulse'));
  check(!pulseAfter, 'pulse stops after interaction');
  const badge = await p.evaluate(() => document.getElementById('jaa-host').shadowRoot.querySelector('.count').textContent);
  check(+badge >= 5, 'count badge shows fields needing attention: ' + badge);
  // answer through the chat composer (Enter)
  await p.locator('#jaa-host .composer textarea').fill('615-555-0100');
  await p.locator('#jaa-host .composer textarea').press('Enter');
  await waitChat(p, /Filled “Phone”/, 10000);
  check(await p.inputValue('#phone') === '615-555-0100', 'answer filled the Phone field on the page');
  check(await p.evaluate(() => document.getElementById('phone').classList.contains('jaa-you')), 'field highlighted as answered by you (teal)');
  await sleep(300);
  let bank = (await store('answerBank')).answerBank;
  check(bank.some(e => /phone/i.test(e.q) && e.a === '615-555-0100' && e.source === 'learned'), 'saved to the answer bank (learning rules)');
  // Website -> Skip
  await waitChat(p, /Website/, 5000);
  await lastCard(p).locator('.chip:not([disabled])', { hasText: 'Skip' }).click();
  // Relocate -> chips
  await p.waitForFunction(() => /willing to relocate/i.test([...document.getElementById('jaa-host').shadowRoot.querySelectorAll('.msg.card')].pop().innerText));
  const chips = await lastCard(p).locator('.chip').allInnerTexts();
  check(chips.includes('Yes') && chips.includes('No') && chips.includes('Skip'), 'select field offered as quick-reply chips: ' + chips.join(' | '));
  await sleep(700); await p.screenshot({ path: SHOTS + '/2-chat-question-chips.png' });
  await lastCard(p).locator('.chip:not([disabled])', { hasText: /^Yes$/ }).click();
  await waitChat(p, /Filled “Are you willing to relocate\?”/, 8000);
  check(await p.$eval('#reloc', s => s.value) === 'Yes', 'chip answer selected "Yes" on the page');
  // Hispanic (EEO) -> chips, not learned
  await p.waitForFunction(() => /Hispanic/i.test([...document.getElementById('jaa-host').shadowRoot.querySelectorAll('.msg.card')].pop().innerText));
  await lastCard(p).locator('.chip:not([disabled])', { hasText: /^No$/ }).click();
  await waitChat(p, /Hispanic\/Latino\?”\. Not saved/, 8000);
  check(await p.$eval('#hisp', s => s.value) === 'No', 'EEO answer filled; chat says it is not saved to the bank');
  // combobox: options read from the dropdown
  await p.waitForFunction(() => /How did you hear/i.test([...document.getElementById('jaa-host').shadowRoot.querySelectorAll('.msg.card')].pop().innerText), null, { timeout: 8000 });
  await p.waitForFunction(() => [...document.getElementById('jaa-host').shadowRoot.querySelectorAll('.msg.card')].pop().querySelectorAll('.chip').length > 3, null, { timeout: 8000 });
  const cchips = await lastCard(p).locator('.chip').allInnerTexts();
  check(cchips.includes('LinkedIn') && cchips.includes('Referral'), 'combobox options peeked into chips: ' + cchips.join(' | '));
  await lastCard(p).locator('.chip:not([disabled])', { hasText: /^LinkedIn$/ }).click();
  await waitChat(p, /Filled “How did you hear about us\?”/, 8000);
  check(await p.inputValue('#hear') === 'LinkedIn', 'combobox value set');
  // pet question: personal, no text box; typed text is neither kept nor sent
  await p.waitForFunction(() => /pet/i.test([...document.getElementById('jaa-host').shadowRoot.querySelectorAll('.msg.card')].pop().innerText), null, { timeout: 8000 });
  check(await lastCard(p).locator('input, textarea').count() === 0 && /personal/.test(await lastCard(p).innerText()), 'pet question: flagged personal, no answer box');
  await p.locator('#jaa-host .composer textarea').fill('Rex');
  await p.locator('#jaa-host .composer textarea').press('Enter');
  await waitChat(p, /That one is personal/, 5000);
  await lastCard(p).locator('.chip:not([disabled])', { hasText: 'Skip' }).click();
  // consent: tick only when Alex says so
  await p.waitForFunction(() => /privacy policy/i.test([...document.getElementById('jaa-host').shadowRoot.querySelectorAll('.msg.card')].pop().innerText), null, { timeout: 8000 });
  check(!(await p.isChecked('#consent')), 'consent box not ticked automatically');
  await lastCard(p).locator('.chip:not([disabled])', { hasText: 'Tick it' }).click();
  await waitChat(p, /privacy policy”\. Not saved/, 8000);
  check(await p.isChecked('#consent'), 'consent ticked only after Alex chose "Tick it"');

  console.log('\n3) blue AI drafts: Accept / Edit / Regenerate (streamed)');
  await p.waitForFunction(() => /AI draft/i.test([...document.getElementById('jaa-host').shadowRoot.querySelectorAll('.msg.card')].pop().innerText), null, { timeout: 8000 });
  let dc = await lastCard(p).innerText();
  check(/team interests you/i.test(dc), 'first draft card: Which team (AI pick)');
  await lastCard(p).locator('.chip:not([disabled])', { hasText: 'Accept' }).click();
  await p.waitForFunction(() => /Why Mockco/.test([...document.getElementById('jaa-host').shadowRoot.querySelectorAll('.msg.card')].pop().innerText), null, { timeout: 8000 });
  const dchips = await lastCard(p).locator('.chip').allInnerTexts();
  check(['✓ Accept', '✎ Edit', '↻ Regenerate'].every(x => dchips.includes(x)), 'essay draft offers Accept / Edit / Regenerate');
  await lastCard(p).locator('.chip:not([disabled])', { hasText: 'Regenerate' }).click();
  const growth = [];
  for (let k = 0; k < 40; k++) { const tx = await p.evaluate(() => [...document.getElementById('jaa-host').shadowRoot.querySelectorAll('.msg.bot')].pop().innerText); growth.push(tx.length); if (/Regenerated draft/.test(await p.inputValue('#e1'))) break; await sleep(60); }
  check(new Set(growth).size > 2, 'regenerated draft streamed into the chat (bubble grew: ' + [...new Set(growth)].slice(0, 6).join('→') + ' chars)');
  await p.waitForFunction(() => /Regenerated draft/.test(document.getElementById('e1').value), null, { timeout: 10000 });
  const e1 = await p.inputValue('#e1');
  check(!/think|planning/.test(e1), 'regenerated text placed in the field, <think> removed: ' + JSON.stringify(e1.slice(0, 60)));
  let lg = L.readLog();
  const dr = lg.filter(x => x.mode === 'draft').pop();
  check(dr && dr.stream && dr.think === false && dr.hasJD && dr.hasTone && dr.hasSamples && dr.hasPrevious, 'draft request: stream:true, think:false, job description + tone + writing samples + previous draft');
  await lastCard(p).locator('.chip:not([disabled])', { hasText: 'Accept' }).click();
  await p.waitForFunction(() => /project you/.test([...document.getElementById('jaa-host').shadowRoot.querySelectorAll('.msg.card')].pop().innerText), null, { timeout: 8000 });
  await lastCard(p).locator('.chip:not([disabled])', { hasText: 'Edit' }).click();
  await lastCard(p).locator('textarea').fill('I rebuilt our release checklist into a small service that saves the team hours every week.');
  await lastCard(p).locator('.chip:not([disabled])', { hasText: 'Save' }).click();
  await waitChat(p, /Updated “Describe a project/, 8000);
  check(/rebuilt our release checklist/.test(await p.inputValue('#e2')), 'edited draft written to the field');
  await sleep(300);
  bank = (await store('answerBank')).answerBank;
  check(bank.some(e => /project you/i.test(e.q) && /release checklist/.test(e.a)), 'edited AI draft learned into the answer bank');
  check(!bank.some(e => /hispanic|pet|privacy/i.test(e.q)) && !JSON.stringify(bank).includes('Rex'), 'no EEO / pet / consent answers in the bank');

  console.log('\n4) review step');
  await waitChat(p, /Review before you submit/i, 8000);
  const rv = await lastCard(p).innerText();
  check(/Needs you \(\d\)/i.test(rv) && /Filled \(\d+\)/i.test(rv), 'review groups fields (Needs you / Filled)');
  check(/profile/.test(rv) && /you/.test(rv) && /AI ✓/.test(rv) && /saved|profile/.test(rv), 'each row shows its source (profile / you / AI ✓)');
  check(await lastCard(p).locator('.jump').count() > 8, 'jump-to links on every row');
  check(/Final checklist/i.test(rv) && /still empty/.test(rv) && /Resume attached/.test(rv) && /never press it/.test(rv), 'final checklist (empty fields, resume, press Submit yourself)');
  await lastCard(p).scrollIntoViewIfNeeded();
  await p.screenshot({ path: SHOTS + '/3-review-step.png' });
  await lastCard(p).locator('.jump').first().click();
  await sleep(300);
  check(await p.evaluate(() => !!document.querySelector('.jaa-flash')), 'jump-to scrolls to and flashes the field');

  console.log('\n5) free-form chat with the local model (streamed) + validated actions');
  await p.locator('#jaa-host .composer textarea').fill("what's left?");
  await p.locator('#jaa-host .composer textarea').press('Enter');
  await waitChat(p, /need you, \d AI answer/, 5000);
  check(/Website/.test(await lastCard(p).innerText()), '"what\'s left?" answered locally: lists Website');
  const n0 = L.readLog().length;
  await p.locator('#jaa-host .composer textarea').fill('make the Why Mockco answer more technical');
  await p.locator('#jaa-host .composer textarea').press('Enter');
  await p.waitForFunction(() => /Technical version/.test(document.getElementById('e1').value), null, { timeout: 15000 });
  await waitChat(p, /Changed by the AI at your request/i, 5000).catch(() => {});
  t = await chatText(p);
  check(/more technical/.test(t) && !/ACTION/.test(t), 'model reply streamed; ACTION line hidden from the chat');
  check(/Changed by the AI at your request/i.test(await lastCard(p).innerText()), 'change applied after validation, shown as a draft card with Undo');
  lg = L.readLog().slice(n0);
  const ch = lg.find(x => x.mode === 'chat');
  check(ch && ch.stream && ch.think === false && ch.hasJD && ch.fields > 10, 'chat request: stream:true, think:false, job description + form state');
  check(ch && !ch.anyPetValue && ch.privateValues.some(l => /Hispanic/.test(l)), 'EEO / personal values withheld from the model: ' + JSON.stringify(ch && ch.privateValues));
  await lastCard(p).locator('.chip:not([disabled])', { hasText: 'Undo' }).click();
  await waitChat(p, /Undone/, 5000);
  check(/Regenerated draft/.test(await p.inputValue('#e1')), 'Undo restored the previous answer');
  await p.locator('#jaa-host .composer textarea').fill('please set the pet question');
  await p.locator('#jaa-host .composer textarea').press('Enter');
  await waitChat(p, /one you need to answer yourself/, 15000);
  check(await p.inputValue('#pet') === '', 'model action on the pet question rejected; field untouched');
  await p.locator('#jaa-host .composer textarea').fill('change the team please');
  await p.locator('#jaa-host .composer textarea').press('Enter');
  await waitChat(p, /isn't one of the options/, 15000);
  check(await p.$eval('#team', s => s.value) !== 'Underwater Basket Weaving', 'invalid option from the model rejected');
  await p.locator('#jaa-host .composer textarea').fill('hello');
  await p.locator('#jaa-host .composer textarea').press('Enter');
  await waitChat(p, /I can see the Mockco application/, 15000);
  check(!/greeting|<think>/.test(await chatText(p)), '<think> stripped from streamed chat');
  await sleep(1500); await p.screenshot({ path: SHOTS + '/4-chat-conversation.png' });

  console.log('\n6) submit warning (non-blocking), never auto-submit');
  check(await p.evaluate(() => window.__submitted) === 0, 'nothing submitted by the extension so far');
  await p.click('#submit');
  await sleep(400);
  const toastTxt = await p.evaluate(() => { const h = document.getElementById('jaa-toast-host'); return h ? h.shadowRoot.querySelector('.t').innerText : ''; });
  check(/Heads up: .*still empty/.test(toastTxt) && /not stopped|went ahead/.test(toastTxt), 'warning toast: ' + JSON.stringify(toastTxt.slice(0, 120)));
  check(await p.evaluate(() => window.__submitted) === 1 && (await p.evaluate(() => window.__submitTrusted)).every(Boolean), 'Alex\'s own submit went through (not blocked); only trusted clicks on Submit');
  await p.screenshot({ path: SHOTS + '/5-submit-warning.png' });

  console.log('\n7) panel: minimize, resize, reduced motion');
  const w0 = await p.evaluate(() => document.getElementById('jaa-host').shadowRoot.querySelector('.panel').offsetWidth);
  const g = await p.locator('#jaa-host .grip').boundingBox();
  await p.mouse.move(g.x + 5, g.y + 5); await p.mouse.down(); await p.mouse.move(g.x - 80, g.y - 40, { steps: 5 }); await p.mouse.up();
  const w1 = await p.evaluate(() => document.getElementById('jaa-host').shadowRoot.querySelector('.panel').offsetWidth);
  check(w1 > w0 + 50, `resizable from the corner: ${w0}px → ${w1}px`);
  await p.locator('#jaa-host [data-h="min"]').click();
  check(await p.evaluate(() => getComputedStyle(document.getElementById('jaa-host').shadowRoot.querySelector('.body')).display) === 'none', 'minimize collapses to the header');
  await p.locator('#jaa-host [data-h="min"]').click();
  await sleep(500);
  const prefs = (await store('uiPrefs')).uiPrefs;
  check(prefs && prefs.w === w1, 'size remembered');

  console.log('\n8) settings link (gear) opens Options at the profile section');
  for (const x of ctx.pages()) if (/options\/options\.html/.test(x.url())) await x.close(); // the welcome tab opened on install
  const [opt] = await Promise.all([ctx.waitForEvent('page'), p.locator('#jaa-host [data-h="settings"]').click()]);
  await opt.waitForLoadState();
  await opt.waitForFunction(() => document.activeElement && document.activeElement.closest('#profile'), null, { timeout: 8000 });
  check(/options\/options\.html/.test(opt.url()), 'Options page opened from the chat header, profile field focused');
  await opt.screenshot({ path: SHOTS + '/7-options-profile.png' });

  console.log('\n9) chat history per job survives a reload');
  await sleep(600);
  const chats = (await store('chats')).chats || {};
  const hk = Object.keys(chats).find(k => /mockco:400/.test(k));
  check(hk && chats[hk].messages.length > 10, 'history stored per job key: ' + hk + ' (' + (hk ? chats[hk].messages.length : 0) + ' messages)');
  check(!JSON.stringify(chats).includes('Rex'), 'personal answer typed in the chat was not stored');
  await p.reload();
  await p.waitForSelector('#jaa-host .btn', { timeout: 15000 });
  await p.locator('#jaa-host .btn').click();
  await waitChat(p, /Earlier in this application/, 10000);
  const oldN = await p.evaluate(() => document.getElementById('jaa-host').shadowRoot.querySelectorAll('.msg.old').length);
  check(oldN >= 8 && /Undone|Technical|Filled “/.test(await chatText(p)), 'earlier messages shown after reload (' + oldN + ' recent ones)');
  await p.waitForFunction(() => !document.getElementById('jaa-host').shadowRoot.querySelector('.prog'), null, { timeout: 60000 }).catch(() => {});

  console.log('\n10) popup');
  const tabs = await sw.evaluate(async () => (await chrome.tabs.query({})).map(t => ({ id: t.id, url: t.url })));
  const job = tabs.find(x => /greenhouse/.test(x.url || ''));
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 320, height: 330 });
  await pop.addInitScript(id => { const q = chrome.tabs.query.bind(chrome.tabs); chrome.tabs.query = async () => [(await q({})).find(t => t.id === id)]; }, job.id);
  await pop.goto(`chrome-extension://${extId}/popup/popup.html`);
  await pop.waitForFunction(() => /ready|Local AI:/.test(document.getElementById('ollama').textContent), null, { timeout: 10000 });
  const ptxt = await pop.innerText('body');
  check(/Job Apply Assistant/.test(ptxt) && new RegExp("v" + require("../manifest.json").version.replace(/\./g, "\\.")).test(ptxt) && /Greenhouse/.test(ptxt) && /Local AI ready/.test(ptxt), 'popup: name, version, site, local AI status');
  check(await pop.locator('#gear').count() === 1, 'popup has the gear (settings) button');
  await pop.screenshot({ path: SHOTS + '/6-popup.png' });
  await pop.close();

  console.log('\n11) backups: rolling 5 snapshots, backup to file, restore from file');
  for (let k = 0; k < 7; k++) {
    await sw.evaluate(async k => { const { answerBank } = await chrome.storage.local.get('answerBank'); await chrome.storage.local.set({ answerBank: answerBank.concat([{ q: 'backup test ' + k, a: String(k) }]) }); }, k);
    await sw.evaluate(() => snapshot('manual', true)); // same code path as the 'backup:now' message (a worker can't message itself)
  }
  const bks = (await store('backups')).backups;
  check(bks.length === 5, 'only the last 5 snapshots are kept: ' + bks.length);
  check(bks.every(x => x.data && x.data.profile && Array.isArray(x.data.answerBank) && Array.isArray(x.data.applications)), 'snapshots contain profile + answer bank + tracker');
  const o2 = await ctx.newPage();
  await o2.goto(`chrome-extension://${extId}/options/options.html#backups`);
  await o2.waitForSelector('#backupRows tr');
  check(await o2.locator('#backupRows tr').count() === 5, 'Options lists the 5 snapshots');
  const [dl] = await Promise.all([o2.waitForEvent('download'), o2.click('#backupFile')]);
  const fpath = '/tmp/jaa-backup-test.json'; await dl.saveAs(fpath);
  const fileData = JSON.parse(require('fs').readFileSync(fpath, 'utf8'));
  check(fileData.kind === 'job-apply-assistant-backup' && fileData.profile.firstName === 'Alex' && fileData.answerBank.length > 7 && fileData.resume && fileData.chats, 'backup file has profile, answers, tracker, resume and chats');
  await sw.evaluate(async () => chrome.storage.local.set({ answerBank: [] }));
  o2.on('dialog', d => d.accept());
  await o2.setInputFiles('#restoreFile', fpath);
  await sleep(1500);
  const after = (await store('answerBank')).answerBank;
  check(after.length === fileData.answerBank.length, 'restore from file brought the answer bank back (' + after.length + ')');
  check(((await store('backups')).backups || []).some(x => x.reason === 'before restore from file'), 'a snapshot was taken before restoring');
  await o2.goto(`chrome-extension://${extId}/options/options.html#style`);
  await o2.waitForSelector('[data-path="writingSamples"]');
  check(/release checklist/.test(await o2.inputValue('[data-path="writingSamples"]')) && await o2.locator('#s_draftLength').count() === 1, 'Options: Writing style section with samples, tone notes and draft length');
  await o2.locator('#style').screenshot({ path: SHOTS + '/8-options-writing-style.png' });
  await o2.locator('#backups').screenshot({ path: SHOTS + '/9-options-backups.png' });

  check(realHits.length === 0, 'no request reached a real job site: ' + JSON.stringify(realHits.slice(0, 3)));
  await ctx.close();

  console.log('\n12) reduced motion: no pulse animation');
  const r2 = await L.launch({ reducedMotion: 'reduce' });
  const p2 = await r2.ctx.newPage();
  await p2.goto('https://job-boards.greenhouse.io/mockco/jobs/400');
  await p2.waitForSelector('#jaa-host .btn', { timeout: 20000 });
  const an = await p2.evaluate(() => getComputedStyle(document.getElementById('jaa-host').shadowRoot.querySelector('.btn')).animationName);
  check(an === 'none', 'prefers-reduced-motion: animation ' + an);
  await r2.ctx.close();

  const f = L.done();
  console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
  process.exit(f ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
