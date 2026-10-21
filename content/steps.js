/* Multi-step / multi-page applications (Workday wizards, LinkedIn Easy Apply, SPA forms
 * with "Step 2 of 5", forms that navigate to a new page per section).
 * One session per job (JAA.jobKey) is kept in chrome.storage via the background worker, so
 * it survives page loads. When a new step appears and the session is active, the step is
 * filled automatically ("Auto-fill next steps" setting). We never press Next / Continue /
 * Submit: the user does, and we notice the new step. */
(function () {
  'use strict';
  if (window.__JAA_STEPS__) return;
  window.__JAA_STEPS__ = true;
  const JAA = window.JAA;
  const C = JAA.core;

  let started = false, lastSig = '', lastPath = location.pathname + location.hash, lastStepN = null, timer = null, curId = '';
  let sessionCache = null;
  const key = () => JAA.jobKey(location.href);
  const send = msg => new Promise(resolve => { try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; resolve(r || null); }); } catch (_) { resolve(null); } });

  function stepInfo() {
    const a = JAA.sites.detect(location);
    try { return (a.stepInfo ? a.stepInfo() : JAA.sites.genericStep()) || null; } catch (_) { return null; }
  }
  function labelsNow() {
    try { return JAA.scan().map(f => f.kind + ':' + C.norm(f.label).slice(0, 60)); } catch (_) { return []; }
  }
  const sigOf = labels => labels.slice().sort().join('|');
  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
  function stepId(info, labels) { return info && info.n ? 's' + info.n : 'p' + hash(sigOf(labels)).slice(0, 8); }

  async function session() {
    const r = await send({ type: 'session:get', key: key() });
    sessionCache = r && r.session;
    return sessionCache;
  }

  // Record what this step contained (for the cross-step Review). Private answers are masked.
  let pending = false; // DOM changed while a fill was running (e.g. the user pressed Next quickly)
  function record(summary) {
    // signature of the fields this run actually filled (not of whatever is on screen now:
    // the user may already have moved on to the next step)
    const ran = (JAA.state && JAA.state.fields) || [];
    const labels = ran.length ? ran.map(f => f.kind + ':' + C.norm(f.label).slice(0, 60)) : labelsNow();
    if (pending || (ran.length && ran.some(f => !f.el || !f.el.isConnected))) { pending = false; setTimeout(() => schedule('after-run'), 300); }
    const info = summary.step || stepInfo();
    curId = stepId(info, labels);
    lastSig = sigOf(labels);
    lastStepN = info && info.n || null;
    const SRC = { rule: 'profile', bank: 'saved', ai: 'AI', you: 'you' };
    const fields = (summary.items || []).map(it => {
      const f = (JAA.state && JAA.state.fields || []).find(x => x.id === it.id);
      const priv = f && (/^(personal|ssn\/dob|gender|transgender|sexualOrientation|hispanic|ethnicity|veteran|disability|pronouns)$/.test((C.ruleFor(f) || {}).key || '') || C.isEeoField(f) || (f.el && f.el.type === 'password') || JAA.NEVER_LEARN.test(JAA.normText(it.label)) && /pet|dog|cat|hobb|spouse|kids|children|religio/.test(JAA.normText(it.label)));
      const v = f ? C.readValue(f) : (it.value || '');
      return { label: String(it.label || '').slice(0, 120), value: priv ? (v ? '(answered, private)' : '') : String(v || '').slice(0, 200), src: it.status === 'todo' ? (v ? 'you' : 'needs you') : (it.status === 'kept' ? 'already there' : (SRC[it.source] || it.status)), cls: it.status === 'todo' ? (v ? 'you' : 'todo') : it.status === 'ai' ? 'ai' : 'ok' };
    });
    const title = info && (info.n || info.label) ? `Step ${info.n || '?'}${info.total ? ' of ' + info.total : ''}${info.label ? ' · ' + info.label : ''}` : 'Page ' + location.pathname.split('/').filter(Boolean).slice(-1)[0];
    const need = (summary.items || []).filter(i => i.status === 'todo').length;
    return send({ type: 'session:update', key: key(), patch: { active: true, title: summary.title || '', company: summary.company || '', site: summary.site || '' },
      step: { id: curId, n: info && info.n || null, total: info && info.total || null, label: info && info.label || '', title, url: location.href, filled: summary.filled, ai: summary.ai, need, fields } })
      .then(r => { if (r && r.session) sessionCache = r.session; return r; });
  }

  async function maybeAutoFill(reason) {
    if (JAA.isRunning && JAA.isRunning()) { schedule(reason); return; }
    const labels = labelsNow();
    if (!labels.length) return;
    const sig = sigOf(labels);
    if (sig === lastSig) return;
    const info = stepInfo();
    const path = location.pathname + location.hash;
    // new step = step number changed, URL changed, or most of the fields are new
    const prev = new Set(lastSig ? lastSig.split('|') : []);
    const overlap = labels.filter(l => prev.has(l)).length / Math.max(1, labels.length);
    const isNewStep = (info && info.n && info.n !== lastStepN) || path !== lastPath || overlap < 0.5;
    if (!isNewStep) return;
    const sess = sessionCache || await session();
    if (!sess || sess.active === false) { lastSig = sig; lastPath = path; return; }
    const { settings } = await JAA.loadAll();
    lastPath = path;
    if (settings.autoFillSteps === false) {
      lastSig = sig;
      JAA.ui.showButton(true);
      JAA.ui.setCount(labels.length);
      return;
    }
    // let the step finish rendering, then make sure it's still the same
    await C.sleep(500);
    if (sigOf(labelsNow()) !== sig || (JAA.isRunning && JAA.isRunning())) { schedule(reason); return; }
    lastSig = sig;
    JAA.ui.showButton(true);
    await JAA.run({ source: 'step', step: info, reason });
  }
  function schedule(reason) { clearTimeout(timer); timer = setTimeout(() => maybeAutoFill(reason), 700); }

  function start() {
    if (started) return;
    started = true;
    lastSig = sigOf(labelsNow());
    const i0 = stepInfo(); lastStepN = i0 && i0.n || null;
    const obs = new MutationObserver(muts => {
      // ignore our own UI
      if (muts.every(m => m.target && m.target.closest && m.target.closest('#jaa-host, #jaa-toast-host, #jaa-match-host, #jaa-tour-host, #jaa-tracked-host, [data-jaa-ui]'))) return;
      if (JAA.isRunning && JAA.isRunning()) { pending = true; return; }
      schedule('dom');
    });
    obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
    setInterval(() => { if (location.pathname + location.hash !== lastPath) schedule('url'); }, 800);
    window.addEventListener('popstate', () => schedule('url'));
    // page-navigation steps: the session from the previous page continues here
    (async () => {
      const sess = await session();
      if (!sess || sess.active === false) return;
      const info = stepInfo();
      const labels = labelsNow();
      const id = stepId(info, labels);
      const { settings } = await JAA.loadAll();
      if (sess.steps && sess.steps[id] && sess.steps[id].url === location.href) { lastSig = sigOf(labels); return; } // reload of a step we already did
      if (settings.autoFillSteps === false || !labels.length) return;
      lastSig = sigOf(labels);
      await C.sleep(300);
      if (!(JAA.isRunning && JAA.isRunning())) JAA.run({ source: 'step', step: info, reason: 'page' });
    })();
  }

  async function end() { await send({ type: 'session:update', key: key(), patch: { active: false, endedAt: Date.now() } }); sessionCache = null; }

  JAA.steps = { start, record, session, end, stepInfo, currentId: () => curId, _check: () => maybeAutoFill('test') };
})();
