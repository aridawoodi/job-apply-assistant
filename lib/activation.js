/* v0.6.7 setup checklist ("Getting started"): pure state logic plus a small DOM renderer shared by the
 * popup, Options and the welcome page. Stored in chrome.storage.local under `activation`:
 * { profileAt, aiAt, practiceAt, realAt, dismissedAt } (timestamps in ms; the first time a step was seen
 * done). Nothing here leaves the computer: no telemetry, no counters sent anywhere. */
(function (g) {
  'use strict';
  const STEPS = [
    { id: 'profile', title: 'Import your resume', doneTitle: 'Profile imported', hint: 'Fills your profile in about a minute. You check everything before it\u2019s saved.' },
    { id: 'ai', title: 'Turn on the AI helper', doneTitle: 'AI helper ready', hint: 'Chrome\u2019s built-in AI or a free AI app on your computer. Writes answers to open questions.' },
    { id: 'practice', title: 'Try a practice fill', doneTitle: 'Practice fill done', hint: 'A sample application inside the extension. Nothing is sent anywhere.' },
    { id: 'real', title: 'Fill your first real application', doneTitle: 'First application filled', hint: 'Open a job application and press Fill. You review and press Submit yourself.' }
  ];
  const KEYS = { profile: 'profileAt', ai: 'aiAt', practice: 'practiceAt', real: 'realAt' };
  const ts = v => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.floor(v) : 0);

  function normalize(st) {
    const s = st && typeof st === 'object' ? st : {};
    return { profileAt: ts(s.profileAt), aiAt: ts(s.aiAt), practiceAt: ts(s.practiceAt), realAt: ts(s.realAt), dismissedAt: ts(s.dismissedAt) };
  }
  // the first time a step is done is kept; returns the same object when nothing changed
  function mark(st, step, now) {
    const s = normalize(st), k = KEYS[step];
    if (!k || s[k]) return s;
    s[k] = ts(now) || Date.now();
    return s;
  }
  // facts measured right now ({ hasProfile, aiReady }) stamp their steps once
  function reconcile(st, facts, now) {
    let s = normalize(st);
    if (facts && facts.hasProfile) s = mark(s, 'profile', now);
    if (facts && facts.aiReady) s = mark(s, 'ai', now);
    return s;
  }
  function view(st) {
    const s = normalize(st);
    const doneOf = { profile: !!s.profileAt, ai: !!s.aiAt, practice: !!(s.practiceAt || s.realAt), real: !!s.realAt };
    const steps = STEPS.map(x => Object.assign({}, x, { done: doneOf[x.id] }));
    const done = steps.filter(x => x.done).length;
    const complete = done === steps.length;
    const next = steps.find(x => !x.done) || null;
    return { steps, done, total: steps.length, pct: Math.round(done / steps.length * 100), complete, next: next && next.id,
      dismissed: !!s.dismissedAt, show: !s.dismissedAt, compact: !complete && !!s.realAt };
  }
  // the checklist can only be hidden once everything is done (it disappears then; no nagging before)
  function dismiss(st, now) {
    const s = normalize(st);
    if (!view(s).complete) return s;
    s.dismissedAt = ts(now) || Date.now();
    return s;
  }
  const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

  /* ---------- renderer (popup, Options, welcome) ---------- */
  let ringN = 0; // unique gradient ids: two rings can share a page (one may be hidden)
  function ring(pct, size) {
    const gid = 'actg' + (++ringN);
    const r = (size - 6) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return `<svg class="act-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#e0e7ff" stroke-width="4"/><circle class="act-ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${gid})" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/><defs><linearGradient id="${gid}" x1="0" x2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs></svg>`;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // opts: { surface: 'popup'|'options'|'welcome', onGo(stepId), onDismiss(), hideDone }
  function render(el, v, opts) {
    opts = opts || {};
    el.innerHTML = '';
    el.className = 'act act-' + (opts.surface || 'page');
    el.hidden = !v.show;
    if (!v.show) return;
    el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Getting started checklist');
    el.dataset.done = String(v.done); el.dataset.total = String(v.total);
    if (v.compact && opts.surface === 'popup') { // a real application is filled: one quiet line, no card
      const nx = v.steps.find(x => !x.done);
      el.innerHTML = `<button type="button" class="act-line" data-act-go="${esc(nx.id)}">${ring(v.pct, 18)}<span>Setup ${v.done}/${v.total} \u00b7 Next: ${esc(nx.title)}</span><span class="act-chev" aria-hidden="true">\u203a</span></button>`;
    } else {
      const title = v.complete ? 'You\u2019re all set' : 'Getting started';
      const sub = v.complete ? 'Everything is set up. Good luck with your applications!' : `${v.done} of ${v.total} done`;
      el.innerHTML = `<div class="act-head">${ring(v.pct, 40)}<div class="act-pct" aria-hidden="true">${v.pct}%</div><div class="act-tt"><b>${title}</b><span class="act-sub">${sub}</span></div>${v.complete ? '<button type="button" class="act-x" data-act-dismiss title="Hide this checklist" aria-label="Hide this checklist">\u00d7</button>' : ''}</div>
        <ol class="act-list">${v.steps.map(s => `<li class="act-step${s.done ? ' is-done' : ''}${s.id === v.next ? ' is-next' : ''}" data-step="${s.id}">
          <button type="button" class="act-go" data-act-go="${s.id}"${s.done && s.id !== 'ai' ? ' tabindex="-1"' : ''} aria-label="${esc((s.done ? s.doneTitle + ' (done)' : s.title))}">
            <span class="act-dot" aria-hidden="true">${s.done ? '\u2713' : ''}</span>
            <span class="act-txt"><span class="act-t">${esc(s.done ? s.doneTitle : s.title)}</span>${!s.done && s.id === v.next && opts.surface !== 'popup' ? `<span class="act-h">${esc(s.hint)}</span>` : ''}</span>
            ${s.done ? '' : '<span class="act-chev" aria-hidden="true">\u203a</span>'}
          </button></li>`).join('')}</ol>`;
    }
    el.querySelectorAll('[data-act-go]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); if (opts.onGo) opts.onGo(b.dataset.actGo); }));
    const x = el.querySelector('[data-act-dismiss]'); if (x) x.addEventListener('click', () => { if (opts.onDismiss) opts.onDismiss(); });
  }

  const api = { STEPS, KEYS, normalize, mark, reconcile, view, dismiss, same, render };
  g.JAA = g.JAA || {}; g.JAA.activation = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
