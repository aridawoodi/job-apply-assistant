'use strict';
const $ = id => document.getElementById(id);
const CONTENT_FILES = JAA.CONTENT_FILES; // same bundle as the built-in sites (lib/defaults.js)

// Keep in sync with content/sites.js (popup can't import content scripts).
const FULL = [
  { re: /(^|\.)greenhouse\.io$/, name: 'Greenhouse' },
  { re: /(^|\.)lever\.co$/, name: 'Lever' },
  { re: /(^|\.)ashbyhq\.com$/, name: 'Ashby' },
  { re: /myworkdayjobs\.com$|myworkday\.com$|myworkdaysite\.com$/, name: 'Workday (basic)', wizard: true },
  { re: /(^|\.)linkedin\.com$/, name: 'LinkedIn Easy Apply', wizard: true },
  { re: /(^|\.)workable\.com$/, name: 'Workable' },
  { re: /(^|\.)bamboohr\.com$/, name: 'BambooHR', path: /\/(careers|jobs)/i },
  { re: /(^|\.)taleo\.net$/, name: 'Taleo' },
  { re: /(^|\.)applytojob\.com$|(^|\.)jazz\.co$/, name: 'JazzHR' },
  { re: /(^|\.)smartrecruiters\.com$|(^|\.)smartr\.me$/, name: 'SmartRecruiters' },
  { re: /(^|\.)rippling\.com$|(^|\.)rippling-ats\.com$/, name: 'Rippling' },
  { re: /(^|\.)icims\.com$/, name: 'iCIMS' },
  { re: /(^|\.)eightfold\.ai$/, name: 'Eightfold' },
  { re: /(^|\.)successfactors\.com$|(^|\.)successfactors\.eu$|(^|\.)sapsf\.com$/, name: 'SuccessFactors' },
  { re: /(^|\.)oraclecloud\.com$/, name: 'Oracle Cloud HCM', path: /CandidateExperience|hcmUI/i }
];
const DETECT_ONLY = [
  { re: /(^|\.)brassring\.com$/, name: 'BrassRing' },
  { re: /(^|\.)clearcompany\.com$/, name: 'ClearCompany' },
  { re: /(^|\.)comeet\.com$|(^|\.)comeet\.co$/, name: 'Comeet' },
  { re: /(^|\.)recruitee\.com$/, name: 'Recruitee' },
  { re: /(^|\.)paylocity\.com$/, name: 'Paylocity' },
  { re: /(^|\.)ultipro\.com$|(^|\.)ultipro\.ca$|(^|\.)ukg\.net$/, name: 'UKG / UltiPro' },
  { re: /(^|\.)jobvite\.com$/, name: 'Jobvite' },
  { re: /(^|\.)breezy\.hr$/, name: 'Breezy' },
  { re: /(^|\.)personio\.com$|(^|\.)personio\.de$/, name: 'Personio' },
  { re: /(^|\.)dayforcehcm\.com$|(^|\.)dayforce\.com$/, name: 'Dayforce' },
  { re: /(^|\.)teamtailor\.com$/, name: 'Teamtailor' },
  { re: /(^|\.)pinpointhq\.com$/, name: 'Pinpoint' },
  { re: /(^|\.)freshteam\.com$/, name: 'Freshteam' },
  { re: /(^|\.)avature\.net$/, name: 'Avature' }
];

function siteOf(url) {
  let u; try { u = new URL(url); } catch (_) { return { name: 'Unknown' }; }
  const h = u.hostname;
  const pathq = u.pathname + u.search;
  for (const d of FULL) {
    if (d.re.test(h) && (!d.path || d.path.test(pathq))) {
      return { name: d.name, supported: true, wizard: !!d.wizard, level: 'full' };
    }
  }
  for (const d of DETECT_ONLY) {
    if (d.re.test(h) && (!d.path || d.path.test(pathq))) {
      return { name: d.name, stub: true, level: 'detect' };
    }
  }
  if (!/^https?:$/.test(u.protocol)) return { name: 'Not a web page', blocked: true, level: 'blocked' };
  return { name: h.replace(/^www\./, ''), other: true, level: 'other' };
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

// One click on any site: activeTab lets us add the in-page bundle to this tab, in every frame we can
// reach (forms often live in an iframe). Idempotent: frames that already have it are skipped.
async function inject(tabId) {
  const into = async target => {
    const have = await chrome.scripting.executeScript({ target, func: () => !!window.__JAA_MAIN__ });
    const need = have.filter(r => !r.result).map(r => r.frameId);
    if (!need.length) return;
    const t = { tabId, frameIds: need };
    await chrome.scripting.executeScript({ target: t, func: () => { window.__JAA_INJECTED_BY_POPUP__ = true; } });
    await chrome.scripting.executeScript({ target: t, files: CONTENT_FILES });
  };
  try { await into({ tabId, allFrames: true }); } catch (_) { await into({ tabId }); } // some frames are off limits: top frame only
}

// Does the page look like a job application? (only lib/jobdetect.js is added, top frame; nothing stored)
async function looksLikeApplication(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['lib/jobdetect.js'] });
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => { const c = self.JAA.jobDetect.check(document, location); return { ok: c.ok, score: c.score }; } });
    return r && r.result ? r.result : { ok: false };
  } catch (_) { return { ok: false }; }
}

// "Use on <site> automatically?" Only for sites that aren't built in, only after a successful Fill or on a
// page that looks like an application, and "Not now" keeps it away from that site for 30 days.
let siteOffer = null, siteTab = null;
function showSiteCard() {
  if (!siteOffer || !siteOffer.show) return;
  $('scHost').textContent = siteOffer.host;
  $('rate').hidden = true;
  $('siteCard').hidden = false;
}
function initSiteAccess(tab, s) {
  if (!s.other) return;
  siteTab = tab;
  chrome.runtime.sendMessage({ type: 'sites:offer', url: tab.url }, async r => {
    if (chrome.runtime.lastError || !r || !r.ok) return;
    siteOffer = r;
    if (r.allowed) { $('siteOn').hidden = false; return; }
    if (r.show && (await looksLikeApplication(tab.id)).ok) showSiteCard();
  });
  $('siteManage').onclick = e => { e.preventDefault(); chrome.runtime.sendMessage({ type: 'options:open', section: 'sites' }, () => { void chrome.runtime.lastError; window.close(); }); };
  $('scLater').onclick = () => { chrome.runtime.sendMessage({ type: 'sites:decline', host: siteOffer.host }); $('siteCard').hidden = true; };
  $('scAllow').onclick = async () => {
    // must run straight from the click (user gesture); Chrome shows its own confirmation
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: [siteOffer.origin] }); } catch (_) { granted = false; }
    const out = $('scOut'); out.hidden = false;
    if (!granted) { out.textContent = 'Not allowed. Fill from this button still works on this site.'; return; }
    const r = await new Promise(res => chrome.runtime.sendMessage({ type: 'sites:add', origin: siteOffer.origin }, x => { void chrome.runtime.lastError; res(x); }));
    if (!r || !r.ok) { out.textContent = (r && r.error) || 'Could not save that.'; return; }
    try { await inject(siteTab.id); await sendToTab(siteTab.id, { type: 'jaa:autodetect' }); } catch (_) { /* next visit */ }
    $('siteCard').hidden = true; $('siteOn').hidden = false;
  };
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

// v0.6.4: optional rating card. Shown only when the background says it's time (3+ applications that went
// out, installed 3+ days, not answered yet), and hidden as soon as a fill starts so it never gets in the way.
let filling = false;
function initRating() {
  chrome.runtime.sendMessage({ type: 'rating:get' }, r => {
    if (chrome.runtime.lastError || !r || !r.ok || !r.eligible || filling || !$('siteCard').hidden) return;
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
  setFlow(2);
  try {
    const useGeneric = generic || !siteOf(tab.url).supported;
    let r = await sendToTab(tab.id, { type: 'jaa:fill', generic: useGeneric });
    if (r && r.noReceiver) {
      await inject(tab.id);
      r = await sendToTab(tab.id, { type: 'jaa:fill', generic: useGeneric });
    }
    if (r && (r.portClosed || r.noReceiver)) r = { ok: false, error: 'No application form found on this page. If the job page has an "Apply" button or tab, open the form first.' };
    showResult(r);
    if (r && r.ok && r.filled > 0) showSiteCard();
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
    $('note').textContent = `${s.name} detected. Using careful generic fill for now — review everything; you still submit.`;
    $('fill').textContent = '⚡ Try fill on this page';
    $('generic').hidden = true;
  }
  else if (!s.supported) { $('note').textContent = 'Works on most application forms. Fill types your profile into this page; check everything, then submit yourself.'; $('generic').hidden = false; }
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
  initChecklist(checkAI);

  initRating();
  initSiteAccess(tab, s);

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
