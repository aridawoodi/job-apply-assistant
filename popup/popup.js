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

async function fill(generic) {
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
  $('generic').onclick = () => fill(true);
  $('opts').onclick = e => { e.preventDefault(); openSection('profile'); };
  $('tracker').onclick = e => { e.preventDefault(); openSection('tracker'); };
  const openSetup = step => chrome.runtime.sendMessage({ type: 'onboarding:open', step }, () => { void chrome.runtime.lastError; window.close(); });
  $('setupLink').onclick = e => { e.preventDefault(); openSetup(''); };
  $('setup').onclick = e => { e.preventDefault(); openSetup(''); };
  chrome.storage.local.get(['onboarding', 'profile']).then(({ onboarding, profile }) => {
    if (!(onboarding && onboarding.done) && !(profile && (profile.firstName || profile.email))) $('setup').hidden = false;
  });

  chrome.runtime.sendMessage({ type: 'ollama:test' }, r => {
    const el = $('ollama');
    if (chrome.runtime.lastError || !r) { el.className = 'bad'; el.textContent = 'Local AI: no reply'; return; }
    el.className = r.ok ? 'good' : 'bad';
    $('odot').className = 'dotx ' + (r.ok ? 'good' : 'bad');
    el.textContent = r.ok ? 'Local AI ready ✓' : 'Local AI: ' + r.error;
  });
})();
