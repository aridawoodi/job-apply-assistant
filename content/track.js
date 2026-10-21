/* Submission tracking. Watches for the user's OWN submit (it never clicks Submit), then for a
 * confirmation or a validation error, and updates the tracker via the background worker.
 * Pending submits are stored in chrome.storage (by the background), so a confirmation on
 * the next page (Lever /thanks, Greenhouse /confirmation) is matched after navigation. */
(function () {
  'use strict';
  if (window.__JAA_TRACK__) return;
  window.__JAA_TRACK__ = true;
  const JAA = window.JAA;
  const C = JAA.core;

  const CONFIRM_URL = /\/(confirmation|thanks|thank[-_]?you|success|submitted|application[-_]?submitted)(\/|$|\?)/i;
  const CONFIRM_TEXT = /(thank(s| you) for (applying|your application|submitting)|application (has been |was )?(successfully )?(submitted|received|sent)|we('ve| have) received your application|your application (has been|was) (successfully )?(submitted|sent|received)|successfully (submitted|applied)|you('ve| have) (successfully )?applied)/i;
  const SUBMIT_TEXT = /^\s*(submit( (my |your )?application)?|send( my)? application|apply( now)?|submit & apply|complete application)\s*$/i;
  const ERROR_SEL = [
    '[role="alert"]', '.error', '.errors', '.field_with_errors', '#error_explanation', '.error-message', '.helper-text--error',
    '[class*="error" i]:not(input):not(select):not(textarea)', '[id$="-error"]', '[data-testid*="error" i]'
  ].join(',');

  const WATCH_MS = 90 * 1000;
  let watching = null; // { since, baselineText, errorSent, done, timer, obs }
  let lastSubmitAt = 0;
  let clickWait = null;  // set while a Submit click waits to see "submit" vs "invalid"
  let trackOn = true;    // cached so a fast page navigation after Submit isn't missed
  JAA.loadAll().then(d => { trackOn = d.settings.trackSubmissions !== false; });
  try {
    chrome.storage.onChanged.addListener(ch => {
      if (ch.settings && ch.settings.newValue) { trackOn = ch.settings.newValue.trackSubmissions !== false; warnOn = ch.settings.newValue.warnOnSubmit !== false; }
    });
  } catch (_) { /* ignore */ }

  function send(msg) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; resolve(r || null); });
      } catch (_) { resolve(null); }
    });
  }

  function adapter() { return JAA.sites.detect(location); }
  function entry(weak) {
    const a = adapter();
    const info = (a.jobInfo ? a.jobInfo() : {}) || {};
    let meta = {};
    try { meta = JAA.jobMeta ? JAA.jobMeta() : {}; } catch (_) { meta = {}; }
    return {
      key: JAA.jobKey(location.href),
      company: info.company || '', title: info.title || '',
      url: window.top === window ? location.href : (document.referrer || location.href),
      formUrl: location.href, site: a.name, weakInfo: !!weak,
      location: meta.location || '', salary: meta.salary || '',
      filledHere: !!(JAA.chat && JAA.chat.hasRun())
    };
  }

  const visible = el => C.isVisible(el) && !el.closest('#jaa-host, #jaa-toast-host');
  function formVisible() {
    return Array.from(document.querySelectorAll('input[type=email], input[name*="email" i], input[id*="email" i], textarea, input[type=file]'))
      .some(el => visible(el) || (el.type === 'file' && visible(el.parentElement || el)));
  }
  function pageText() { return (document.body && document.body.innerText) || ''; }
  function confirmedNow(baselineText) {
    if (CONFIRM_URL.test(location.pathname + location.search)) return 'URL ' + location.pathname;
    const t = pageText();
    const m = t.match(CONFIRM_TEXT);
    if (!m) return null;
    // job descriptions often say "Thank you for your interest"; require the phrase to be
    // new since the submit, or the application form to be gone.
    // On a freshly loaded page (baseline null) only trust the text once the form is gone.
    const isNew = baselineText != null && !CONFIRM_TEXT.test(baselineText);
    if (isNew || !formVisible()) return '"' + m[0] + '"';
    return null;
  }
  function errorsNow() {
    const out = [];
    document.querySelectorAll(ERROR_SEL).forEach(el => {
      if (!visible(el)) return;
      const t = C.textOf(el);
      if (t && t.length < 300 && !/^\s*$/.test(t)) out.push(t);
    });
    document.querySelectorAll('[aria-invalid="true"]').forEach(el => { if (visible(el)) out.push('Invalid: ' + (el.name || el.id || 'field')); });
    return Array.from(new Set(out));
  }

  function toast(text, kind, sub) { if (JAA.ui && JAA.ui.toast) JAA.ui.toast(text, kind, sub); }
  // Non-blocking heads-up when the user submits with yellow / unreviewed blue fields left.
  // The submit itself is never stopped, delayed or changed.
  let submitWarn = '';
  let warnOn = true;
  JAA.loadAll().then(d => { warnOn = d.settings.warnOnSubmit !== false; });
  function computeWarn() {
    if (!warnOn || !JAA.chat || !JAA.chat.hasRun()) return '';
    const a = JAA.chat.attention();
    if (!a.total) return '';
    const parts = [];
    if (a.yellow) parts.push(`${a.yellow} field${a.yellow > 1 ? 's' : ''} still empty`);
    if (a.blue) parts.push(`${a.blue} AI answer${a.blue > 1 ? 's' : ''} not reviewed`);
    return `Heads up: ${parts.join(' and ')}${a.labels.length ? ` (${a.labels.slice(0, 2).map(l => '“' + String(l).slice(0, 40) + '”').join(', ')}${a.labels.length > 2 ? '…' : ''})` : ''}.`;
  }

  async function report(event, detail, weak) {
    // reuse the job info captured at submit time: SPA confirmations replace the page
    // (the h1 becomes "Thank you for applying!")
    const ent = watching && watching.entry && event !== 'submitted' ? watching.entry : entry(weak);
    const r = await send({ type: 'tracker:event', event, detail, entry: ent });
    if (!r || r.disabled) return r;
    if (r.ok) {
      const what = r.row && (r.row.company || r.row.title) ? ` · ${[r.row.company, r.row.title].filter(Boolean).join(' — ')}` : '';
      if (event === 'submitted') {
        if (submitWarn) toast(submitWarn, 'warn', 'Your submit went ahead (I never block it) · tracker: Submitted');
        else toast('Submit detected — waiting for confirmation…' + what, 'info');
      }
      if (event === 'confirmed') { if (!trackedModal(r.row, ent)) toast('Application confirmed ✓ Tracker: Applied' + what, 'ok'); if (JAA.steps) JAA.steps.end(); }
      if (event === 'error') toast('Not sent — the form shows an error. Fix it and submit again.' + what, 'err');
    }
    return r;
  }

  // "Application tracked ✓" with optional notes + reminder date (stored only in the tracker)
  let modalShown = false;
  function trackedModal(row, ent) {
    if (modalShown || !row || !document.body) return false;
    modalShown = true;
    const h = JAA.ui.h;
    const host = document.createElement('div');
    host.id = 'jaa-tracked-host';
    const root = host.attachShadow({ mode: 'open' });
    const css = document.createElement('style');
    css.textContent = `:host{all:initial}
      .bd{position:fixed;inset:0;background:rgba(15,23,42,.35);z-index:2147483646;display:flex;align-items:center;justify-content:center;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a}
      .m{background:#fff;border-radius:16px;box-shadow:0 20px 50px rgba(15,23,42,.3);width:min(400px,92vw);padding:20px 22px}
      .ic{width:44px;height:44px;border-radius:50%;background:#dcfce7;color:#15803d;display:flex;align-items:center;justify-content:center;font:800 22px/1 inherit;margin-bottom:8px}
      h2{margin:0 0 2px;font-size:18px}.sub{color:#475569;font-size:13px;margin-bottom:12px}
      label{display:block;font-size:12px;font-weight:600;color:#334155;margin:8px 0 4px}
      textarea,input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:9px;padding:8px;font:13px/1.4 inherit}
      textarea{min-height:70px;resize:vertical}
      .row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
      button{border:0;border-radius:9px;padding:9px 14px;font:700 13px/1 inherit;cursor:pointer}
      .p{background:#4f46e5;color:#fff}.s{background:#f1f5f9;color:#334155}
      .lock{color:#94a3b8;font-size:11px;margin-top:10px}`;
    const notes = h('textarea', { placeholder: 'Notes (optional): who referred you, what to follow up on…' });
    const rem = h('input', { type: 'date' });
    const close = () => host.remove();
    const save = async () => {
      if (notes.value.trim() || rem.value) await send({ type: 'tracker:update', entry: ent || { key: row.key }, patch: { notes: notes.value.trim(), reminderAt: rem.value } });
      close();
      toast('Saved to your tracker ✓', 'ok', 'Job Apply Assistant · tracker');
    };
    const m = h('div', { class: 'm', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Application tracked' },
      h('div', { class: 'ic', text: '✓' }), h('h2', { text: 'Application tracked ✓' }),
      h('div', { class: 'sub', text: [row.company, row.title].filter(Boolean).join(' · ') + ' · stage: Applied' }),
      h('label', { text: 'Notes' }), notes, h('label', { text: 'Remind me to follow up on' }), rem,
      h('div', { class: 'row' }, h('button', { class: 's', type: 'button', 'data-act': 'close', text: 'Close', onclick: close }), h('button', { class: 'p', type: 'button', 'data-act': 'save', text: 'Save', onclick: save })),
      h('div', { class: 'lock', text: '🔒 Stored only in your tracker on this computer.' }));
    const bd = h('div', { class: 'bd' }, m);
    bd.addEventListener('click', e => { if (e.target === bd) close(); });
    ['keydown', 'keyup', 'keypress'].forEach(ev => bd.addEventListener(ev, e => { e.stopPropagation(); if (ev === 'keydown' && e.key === 'Escape') close(); }));
    root.append(css, bd);
    document.documentElement.appendChild(host);
    return true;
  }

  async function reportWith(ent, event, detail) {
    const saved = watching;
    watching = { entry: ent };
    try { return await report(event, detail); } finally { watching = saved; }
  }

  function stopWatch() {
    if (!watching) return;
    watching.done = true;
    clearInterval(watching.timer);
    if (watching.obs) watching.obs.disconnect();
    watching = null;
  }

  function startWatch(baselineText, fromNewPage) {
    stopWatch();
    const w = watching = { since: Date.now(), baselineText, errorSent: false, done: false, fromNewPage, entry: entry(!!fromNewPage) };
    let lastUrl = location.href, scheduled = false;
    const check = async () => {
      scheduled = false;
      if (w.done) return;
      const c = confirmedNow(w.baselineText);
      if (c) { stopWatch(); await reportWith(w.entry, 'confirmed', c); return; }
      const age = Date.now() - w.since;
      if (age > 800 && !w.errorSent && formVisible()) {
        const errs = errorsNow();
        if (errs.length) { w.errorSent = true; await report('error', errs.slice(0, 3).join(' | ')); }
      } else if (w.errorSent && !errorsNow().length) {
        w.errorSent = false; // errors cleared; a later error after another submit is reported again
      }
      if (age > WATCH_MS) stopWatch();
    };
    const soon = () => { if (!scheduled) { scheduled = true; setTimeout(check, 250); } };
    w.obs = new MutationObserver(soon);
    w.obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-invalid', 'class', 'style', 'hidden'] });
    w.timer = setInterval(() => { if (location.href !== lastUrl) { lastUrl = location.href; } check(); }, 1000);
    soon();
  }

  async function onSubmitSignal(how) {
    if (C.isFilling() || !trackOn) return;   // never react to our own autofill
    if (how === 'submit event' && clickWait) { clickWait('submit'); return; }
    const now = Date.now();
    if (now - lastSubmitAt < 2500) return;    // click + submit + network for the same press
    lastSubmitAt = now;
    submitWarn = computeWarn();
    if (submitWarn) toast(submitWarn, 'warn', 'Your submit was not stopped. Check the page if the site shows errors.');
    const baseline = pageText();
    if (how === 'click') {
      // A click is followed by either a "submit" event (form passed browser validation)
      // or "invalid" events (browser blocked it). Wait briefly to tell them apart.
      const invalid = [];
      const onInvalid = e => invalid.push(e.target.name || e.target.id || 'field');
      document.addEventListener('invalid', onInvalid, true);
      const outcome = await new Promise(res => { clickWait = res; setTimeout(() => res('timeout'), 400); });
      clickWait = null;
      document.removeEventListener('invalid', onInvalid, true);
      if (outcome !== 'submit' && invalid.length) {
        await report('submitted', 'click on Submit');
        startWatch(baseline);
        if (watching) watching.errorSent = true;
        await report('error', 'Browser blocked the submit: required/invalid fields (' + Array.from(new Set(invalid)).slice(0, 5).join(', ') + ')');
        return;
      }
      how = outcome === 'submit' ? 'click + submit event' : 'click';
    }
    if (JAA.learn) JAA.learn.flush('submit'); // save the user's final answers before the page goes away
    report('submitted', how); // not awaited: the page may navigate away right now
    startWatch(baseline);
  }

  // 1) native submit (Enter key or a real submit button) — capture phase, never cancelled here
  window.addEventListener('submit', () => onSubmitSignal('submit event'), true);
  // 2) the user's click on the real Submit button (React apps often submit via fetch on click)
  document.addEventListener('click', e => {
    if (!e.isTrusted) return; // our own autofill clicks are synthetic and ignored
    const b = e.target && e.target.closest && e.target.closest('button, input[type=submit], [role="button"]');
    if (!b || b.closest('#jaa-host')) return;
    const txt = C.textOf(b) || b.value || b.getAttribute('aria-label') || '';
    const isSubmitType = (b.tagName === 'BUTTON' && b.type === 'submit' && b.form) || (b.tagName === 'INPUT' && b.type === 'submit');
    if (SUBMIT_TEXT.test(txt) || (isSubmitType && /submit|apply|send/i.test(txt))) onSubmitSignal('click');
  }, true);
  // 3) the site's own POST to its apply endpoint (seen by content/netwatch.js)
  window.addEventListener('message', e => {
    const d = e.data;
    if (e.source !== window || !d || d.__jaa !== 'net' || C.isFilling()) return;
    if (d.status >= 400 || d.status === 0) {
      if (watching && !watching.errorSent) {
        watching.errorSent = true;
        report('error', `Server answered ${d.status || 'network error'} for ${new URL(d.url, location.href).pathname}`);
      }
    } else if (!watching && Date.now() - lastSubmitAt > 2500) {
      onSubmitSignal('network POST ' + new URL(d.url, location.href).pathname);
    }
  });

  // 4) on page load: continue a pending submit from the previous page, or notice a
  //    confirmation page reached without us seeing the submit
  (async function resume() {
    const { settings } = await JAA.loadAll();
    if (settings.trackSubmissions === false) return;
    const r = await send({ type: 'tracker:pending', key: JAA.jobKey(location.href) });
    if (r && r.pending) {
      startWatch(null, true);
    } else if (CONFIRM_URL.test(location.pathname)) {
      report('confirmed', 'URL ' + location.pathname, true);
    }
  })();

  JAA.track = { confirmedNow, errorsNow, onSubmitSignal, isWatching: () => !!watching };
})();
