'use strict';
const $ = id => document.getElementById(id);
const CONTENT_FILES = ['lib/defaults.js', 'lib/match.js', 'content/core.js', 'content/sites.js', 'content/ui.js', 'content/learn.js', 'content/chat.js', 'content/panel.js', 'content/refine.js', 'content/steps.js', 'content/track.js', 'content/main.js', 'content/match.js'];

// Keep in sync with content/sites.js (popup can't import content scripts).
const DETECT_ONLY = [
  { re: /(^|\.)taleo\.net$/, name: 'Taleo' },
  { re: /(^|\.)bamboohr\.com$/, name: 'BambooHR', path: /\/careers\//i },
  { re: /(^|\.)workable\.com$/, name: 'Workable' },
  { re: /(^|\.)rippling\.com$|(^|\.)rippling-ats\.com$/, name: 'Rippling' },
  { re: /(^|\.)applytojob\.com$|(^|\.)jazz\.co$/, name: 'JazzHR' },
  { re: /(^|\.)smartrecruiters\.com$/, name: 'SmartRecruiters' },
  { re: /(^|\.)icims\.com$/, name: 'iCIMS' },
  { re: /(^|\.)eightfold\.ai$/, name: 'Eightfold' },
  { re: /(^|\.)successfactors\.com$|(^|\.)successfactors\.eu$|(^|\.)sapsf\.com$/, name: 'SuccessFactors' },
  { re: /(^|\.)oraclecloud\.com$/, name: 'Oracle Cloud HCM', path: /CandidateExperience|hcmUI/i }
];

function siteOf(url) {
  let u; try { u = new URL(url); } catch (_) { return { name: 'Unknown' }; }
  const h = u.hostname;
  if (/(^|\.)greenhouse\.io$/.test(h)) return { name: 'Greenhouse', supported: true, level: 'full' };
  if (/(^|\.)lever\.co$/.test(h)) return { name: 'Lever', supported: true, level: 'full' };
  if (/(^|\.)ashbyhq\.com$/.test(h)) return { name: 'Ashby', supported: true, level: 'full' };
  if (/myworkdayjobs\.com$|myworkday\.com$|myworkdaysite\.com$/.test(h)) return { name: 'Workday (basic)', supported: true, wizard: true, level: 'full' };
  if (/(^|\.)linkedin\.com$/.test(h)) return { name: 'LinkedIn Easy Apply', supported: true, wizard: true, level: 'full' };
  for (const d of DETECT_ONLY) {
    if (d.re.test(h) && (!d.path || d.path.test(u.pathname + u.search))) {
      return { name: d.name, stub: true, level: 'detect' };
    }
  }
  if (!/^https?:$/.test(u.protocol)) return { name: 'Not a web page', blocked: true, level: 'blocked' };
  return { name: 'Other site', level: 'other' };
}

function setFlow(step) {
  document.querySelectorAll('.flow .fs').forEach(el => {
    const n = +el.dataset.step;
    el.classList.toggle('on', n === step);
    el.classList.toggle('done', n < step);
  });
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
  const next = $('nextHint');
  if (!r) { box.innerHTML = '<span class="bad">No reply from the page.</span>'; next.hidden = true; return; }
  if (r.ok === false) { box.innerHTML = ''; const s = document.createElement('div'); s.className = 'bad'; s.textContent = r.error || 'Failed.'; box.appendChild(s); next.hidden = true; setFlow(2); return; }
  box.innerHTML = `<div><span class="pill ok">${r.filled} filled</span><span class="pill ai">${r.ai} AI</span><span class="pill todo">${r.todo} need you</span></div>`;
  if (r.llmError) { const s = document.createElement('div'); s.className = 'bad'; s.textContent = 'Local AI: ' + r.llmError; box.appendChild(s); }
  const n = document.createElement('div'); n.className = 'muted'; n.textContent = 'Details are on the page. Review everything, then press Submit yourself.'; box.appendChild(n);
  setFlow(3);
  next.hidden = false;
  $('nextTxt').textContent = (r.todo > 0)
    ? `${r.todo} field${r.todo > 1 ? 's' : ''} still need you — finish those in the assistant, then you submit.`
    : 'Looks filled. Skim the form once, then press the site’s Submit yourself.';
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

async function fill(generic) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const btn = generic ? $('generic') : $('fill');
  btn.disabled = true; const old = btn.textContent; btn.textContent = 'Filling…';
  setFlow(2);
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
  const cap = $('cap');
  cap.hidden = false;
  if (s.level === 'full') { cap.textContent = 'Full fill'; cap.className = 'cap full'; }
  else if (s.level === 'detect') { cap.textContent = 'Detected · generic fill'; cap.className = 'cap detect'; }
  else if (s.blocked) { cap.hidden = true; }
  else { cap.textContent = 'Try generic fill'; cap.className = 'cap other'; }

  setFlow(1);
  if (s.blocked) { $('fill').disabled = true; $('note').textContent = 'Open a job application page first.'; }
  else if (s.stub) {
    $('note').textContent = `${s.name} detected. Full adapter is next — try fill now with careful generic matching. You still review and submit.`;
    $('fill').textContent = '⚡ Try fill on this page';
    $('generic').hidden = true;
  }
  else if (!s.supported) { $('note').textContent = 'Not a known ATS page. If the form is embedded from Greenhouse, Fill still works; otherwise try generic fill.'; $('generic').hidden = false; }
  else if (s.wizard) $('note').textContent = 'Fills the open step. You press Next yourself; I never press Submit.';
  else $('note').textContent = 'Ready — fill from your profile, review on the page, then you submit.';

  $('ver').textContent = 'v' + chrome.runtime.getManifest().version + ' · local AI';
  const openSection = section => chrome.runtime.sendMessage({ type: 'options:open', section }, () => { void chrome.runtime.lastError; window.close(); });
  $('gear').onclick = () => openSection('profile');
  $('backup').onclick = e => { e.preventDefault(); openSection('backups'); };

  $('fill').onclick = () => fill(!!s.stub);
  $('profile').onclick = () => openPanel('profile');
  $('openPanel').onclick = () => openPanel('assistant');
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
