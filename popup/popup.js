'use strict';
const $ = id => document.getElementById(id);
const CONTENT_FILES = ['lib/defaults.js', 'lib/match.js', 'content/core.js', 'content/sites.js', 'content/ui.js', 'content/learn.js', 'content/chat.js', 'content/panel.js', 'content/refine.js', 'content/steps.js', 'content/track.js', 'content/main.js', 'content/match.js'];

function siteOf(url) {
  let u; try { u = new URL(url); } catch (_) { return { name: 'Unknown' }; }
  const h = u.hostname;
  if (/(^|\.)greenhouse\.io$/.test(h)) return { name: 'Greenhouse', supported: true };
  if (/(^|\.)lever\.co$/.test(h)) return { name: 'Lever', supported: true };
  if (/(^|\.)ashbyhq\.com$/.test(h)) return { name: 'Ashby', supported: true };
  if (/myworkdayjobs\.com$|myworkday\.com$|myworkdaysite\.com$/.test(h)) return { name: 'Workday (basic)', supported: true, wizard: true };
  if (/(^|\.)linkedin\.com$/.test(h)) return { name: 'LinkedIn Easy Apply', supported: true, wizard: true };
  if (!/^https?:$/.test(u.protocol)) return { name: 'Not a web page', blocked: true };
  return { name: 'Other site' };
}

function sendToTab(tabId, msg) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, msg, r => {
      const err = chrome.runtime.lastError;
      resolve(err ? { noReceiver: /Receiving end does not exist/i.test(err.message), portClosed: /port closed/i.test(err.message), error: err.message } : r);
    });
  });
}

async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, func: () => { window.__JAA_INJECTED_BY_POPUP__ = true; } });
  await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
}

function showResult(r) {
  const box = $('result');
  if (!r) { box.innerHTML = '<span class="bad">No reply from the page.</span>'; return; }
  if (r.ok === false) { box.innerHTML = ''; const s = document.createElement('div'); s.className = 'bad'; s.textContent = r.error || 'Failed.'; box.appendChild(s); return; }
  box.innerHTML = `<div><span class="pill ok">${r.filled} filled</span><span class="pill ai">${r.ai} AI</span><span class="pill todo">${r.todo} need you</span></div>`;
  if (r.llmError) { const s = document.createElement('div'); s.className = 'bad'; s.textContent = 'Local AI: ' + r.llmError; box.appendChild(s); }
  const n = document.createElement('div'); n.className = 'muted'; n.textContent = 'Details are on the page. Review everything, then press Submit yourself.'; box.appendChild(n);
}

// open the in-page panel on a tab (Profile works on any normal web page; it's injected on demand)
async function openPanel(tabName) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const fallback = () => chrome.runtime.sendMessage({ type: 'options:open', section: 'profile' }, () => { void chrome.runtime.lastError; window.close(); });
  if (!tab || !/^https?:/.test(tab.url || '')) return fallback();
  try {
    let r = await sendToTab(tab.id, { type: 'jaa:panel', tab: tabName });
    if (r && (r.noReceiver || r.portClosed)) { await inject(tab.id); r = await sendToTab(tab.id, { type: 'jaa:panel', tab: tabName }); }
    if (r && r.ok) window.close(); else fallback();
  } catch (_) { fallback(); }
}

// v0.6.4: optional rating card. Shown only when the background says it's time (3+ applications that went
// out, installed 3+ days, not answered yet), and hidden as soon as a fill starts so it never gets in the way.
let filling = false;
function initRating() {
  chrome.runtime.sendMessage({ type: 'rating:get' }, r => {
    if (chrome.runtime.lastError || !r || !r.ok || !r.eligible || filling) return;
    const card = $('rate');
    const act = action => new Promise(res => chrome.runtime.sendMessage({ type: 'rating:act', action }, () => { void chrome.runtime.lastError; res(); }));
    $('rateYes').onclick = async () => { await act('rate'); card.hidden = true; await chrome.tabs.create({ url: r.reviewUrl }); window.close(); };
    $('rateLater').onclick = async () => { await act('later'); card.hidden = true; };
    $('rateNever').onclick = async () => { await act('never'); card.hidden = true; };
    $('rateFeedback').onclick = async e => { e.preventDefault(); await chrome.tabs.create({ url: r.feedbackUrl }); window.close(); };
    card.hidden = false;
  });
}

// v0.6.7: "Getting started" checklist (lib/activation.js). Shown until all four steps are done and the user
// hides it; after the first real application it shrinks to one quiet line. State is local only.
function initChecklist(done) {
  chrome.runtime.sendMessage({ type: 'activation:get' }, r => {
    if (done) done(r && r.view);
    if (chrome.runtime.lastError || !r || !r.view) return;
    JAA.activation.render($('checklist'), r.view, {
      surface: 'popup',
      onGo: step => chrome.runtime.sendMessage({ type: 'activation:go', step }, () => { void chrome.runtime.lastError; window.close(); }),
      onDismiss: () => chrome.runtime.sendMessage({ type: 'activation:dismiss' }, () => { void chrome.runtime.lastError; $('checklist').hidden = true; })
    });
  });
}

async function fill(generic) {
  filling = true; $('rate').hidden = true;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const btn = generic ? $('generic') : $('fill');
  btn.disabled = true; const old = btn.textContent; btn.textContent = 'Filling…';
  try {
    let r = await sendToTab(tab.id, { type: 'jaa:fill', generic });
    if (r && r.noReceiver) {
      await inject(tab.id);
      r = await sendToTab(tab.id, { type: 'jaa:fill', generic: generic || !siteOf(tab.url).supported });
    }
    if (r && r.portClosed) r = { ok: false, error: 'No application form found on this page. On Lever/Ashby, open the "Apply"/"Application" tab first.' };
    showResult(r);
  } catch (e) {
    showResult({ ok: false, error: String(e.message || e) });
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
}

(async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const s = siteOf(tab && tab.url);
  $('site').textContent = s.name;
  if (s.blocked) { $('fill').disabled = true; $('note').textContent = 'Open a job application page first.'; }
  else if (s.stub) { $('note').textContent = `${s.name} support is planned next. Generic fill may get some fields.`; $('fill').hidden = true; $('generic').hidden = false; }
  else if (!s.supported) { $('note').textContent = 'Not a Greenhouse/Lever/Ashby page. If the form is embedded from Greenhouse, Fill still works; otherwise try generic fill.'; $('generic').hidden = false; }
  else if (s.wizard) $('note').textContent = 'Fills the step that\'s open, then each next step after you press Next yourself. Never presses Next or Submit.';
  else $('note').textContent = 'Fills from your saved profile and opens the assistant chat. It never presses Submit.';
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version + ' · local AI';
  const openSection = section => chrome.runtime.sendMessage({ type: 'options:open', section }, () => { void chrome.runtime.lastError; window.close(); });
  $('gear').onclick = () => openSection('profile');
  $('backup').onclick = e => { e.preventDefault(); openSection('backups'); };

  $('fill').onclick = () => fill(false);
  $('profile').onclick = () => openPanel('profile');
  const tour = e => { if (e) e.preventDefault(); chrome.runtime.sendMessage({ type: 'tour:open' }, () => { void chrome.runtime.lastError; window.close(); }); };
  $('tourLink').onclick = tour;
  $('wntour').onclick = e => { chrome.runtime.sendMessage({ type: 'whatsnew:seen' }); tour(e); };
  $('wnx').onclick = () => { chrome.runtime.sendMessage({ type: 'whatsnew:seen' }); $('whatsnew').hidden = true; };
  chrome.storage.local.get(['whatsNew', 'settings']).then(({ whatsNew, settings }) => {
    if (whatsNew && !whatsNew.seen && whatsNew.from && !(settings && settings.whatsNew === false)) { $('wnv').textContent = whatsNew.version; $('whatsnew').hidden = false; }
  });
  $('generic').onclick = () => fill(true);
  $('opts').onclick = e => { e.preventDefault(); openSection('profile'); };
  $('tracker').onclick = e => { e.preventDefault(); openSection('tracker'); };
  const openSetup = step => chrome.runtime.sendMessage({ type: 'onboarding:open', step }, () => { void chrome.runtime.lastError; window.close(); });
  $('setupLink').onclick = e => { e.preventDefault(); openSetup(''); };
  initChecklist(checkAI);

  initRating();

  // AI status line. While the AI helper was never set up it's optional, so say so calmly instead of an error.
  function checkAI(view) {
  const aiNeverSetUp = view && !view.steps.find(s => s.id === 'ai').done;
  chrome.runtime.sendMessage({ type: 'ollama:test' }, r => {
    const el = $('ollama');
    if (chrome.runtime.lastError || !r) { el.className = 'bad'; el.textContent = 'Local AI: no reply'; return; }
    if (!r.ok && aiNeverSetUp) { el.className = 'muted'; el.textContent = 'AI helper not set up (optional). Forms still fill from your profile.'; return; }
    el.className = r.ok ? 'good' : 'bad';
    $('odot').className = 'dotx ' + (r.ok ? 'good' : 'bad');
    el.textContent = r.ok ? 'Local AI ready ✓' : 'Local AI: ' + r.error;
  });
  }
})();
