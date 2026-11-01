/* v0.6.8 review panel ("triage") shown in the fill card once a fill finishes. Every field lands in one group:
 *   Needs you   - empty (required first), or blocked: the user has to answer it
 *   Check these - written by local AI, flagged by the answer guard, or a guessed option / similar saved answer
 *   Filled      - from the saved profile, saved answers, the user, or AI answers the user checked
 * Each row says why in one plain line (no field ids or raw errors), jumps to and focuses the field, and AI
 * rows show the resume lines they drew on plus "Rewrite with instruction" and "Mark as fine".
 * Group = icon + text + colour (never colour alone); counts are announced through a polite live region. */
(function () {
  'use strict';
  if (window.__JAA_TRIAGE__) return;
  window.__JAA_TRIAGE__ = true;
  const JAA = window.JAA = window.JAA || {};
  const C = () => JAA.core;
  const h = (...a) => JAA.ui.h(...a);
  const trunc = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  const GROUPS = {
    need: { title: 'Needs you', icon: '!', empty: '' },
    check: { title: 'Check these', icon: '?', empty: '' },
    done: { title: 'Filled', icon: '✓', empty: '' }
  };

  // One friendly line for an item that still needs the user. Never shows ids, stack traces or HTTP errors.
  function needReason(it, ctx) {
    const w = String(it.why || '');
    if (it.off) return 'Turned off in Settings → Fields to fill.';
    if (it.unstuck) return 'The site cleared what I typed. Please fill it by hand.';
    if (it.missing === 'resume') return 'Add your resume in Settings, or attach it here.';
    if (it.cover) return 'Cover letter: write one from your resume (Resume tab), or attach your own.';
    if (it.eeo || (ctx && ctx.isEeo)) return it.missing ? 'Voluntary self-identification: only you answer this (or set it in Settings).' : 'Your saved answer isn\'t one of the choices here. Pick one.';
    if (it.missing) return 'Not in your profile yet.';
    if (/Yes\/No/.test(w)) return 'Your saved answer doesn\'t map to Yes or No. Pick one.';
    if (/didn't match any option|No matching option|No options appeared/i.test(w)) return 'None of the choices matched your profile. Pick one.';
    if (/timed out/i.test(w)) return 'Local AI ran out of time. Use Retry AI, or answer it.';
    if (/AI error/i.test(w)) return 'Local AI couldn\'t answer this one. Use Retry AI, or answer it.';
    if (/AI had no answer/i.test(w)) return 'Nothing in your profile answers this.';
    if (/another question/i.test(w)) return 'The AI\'s answer didn\'t fit this question.';
    if (/AI answer didn't fit/i.test(w)) return 'The AI\'s answer didn\'t fit this field.';
    if (/consent|terms/i.test(w)) return 'Consent or terms: read it and tick it yourself.';
    if (/Sensitive|SSN|date of birth/i.test(w)) return 'Sensitive (SSN or date of birth): fill this yourself.';
    if (/File upload/i.test(w)) return 'Not sure what this upload is for. Attach a file yourself if needed.';
    if (/Not a number/i.test(w)) return 'Needs a number.';
    if (/Needs a date/i.test(w)) return 'Needs a date in the site\'s format.';
    if (/Didn't stick/i.test(w)) return 'The site cleared what I typed. Please fill it by hand.';
    if (ctx && ctx.aiOff) return 'Local AI is off, so this one is yours to answer.';
    // an authored sentence can be shown as is; anything that looks like an id or a raw error can't
    if (w && w.length <= 120 && !/["{}<>]|\bf\d+\b|HTTP|Error|undefined|null|NaN|\(\w+\)$/.test(w)) return w;
    return 'Needs your answer.';
  }
  function checkReason(it) {
    if (it.status === 'ai') {
      if (it.flagged && it.flagged.length) return { claims: it.flagged.map(f => f.term), text: it.flagged.length > 1 ? 'aren\'t in your resume or profile. Check before you submit.' : 'isn\'t in your resume or profile. Check before you submit.' };
      if (it.guard && it.guard.removed && it.guard.removed.length) return { text: 'Written by local AI. I removed a claim that isn\'t in your resume.' };
      if (it.essay) return { text: 'Written by local AI from your resume. Read it before you submit.' };
      const f = it.kind;
      if (/select|radio|buttons|combobox|listbutton|checkboxGroup/.test(f)) return { text: 'Chosen by local AI. Confirm it\'s right.' };
      return { text: 'Answered by local AI. Confirm it\'s right.' };
    }
    if (it.weak) return { text: it.bankQ ? `From your saved answer to “${trunc(it.bankQ, 60)}”. Confirm it fits.` : 'From a saved answer to a similar question. Confirm it fits.' };
    if (it.guessed) return { text: it.from ? `Closest choice to your profile answer “${trunc(it.from, 50)}”. Confirm it.` : 'Closest choice to your profile. Confirm it.' };
    return { text: 'Check this.' };
  }
  function doneReason(it, edited, eeo) {
    if (edited) return 'You edited this.';
    if (eeo && it.status === 'ok') return 'Your saved self-identification answer.';
    if (it.status === 'todo') return 'You filled this.';
    if (it.status === 'you') return 'Answered by you.';
    if (it.status === 'kept') return 'Already filled on the page.';
    if (it.status === 'ai') return it.fine ? 'AI answer, marked as fine by you.' : 'AI answer, checked by you.';
    if (it.kind === 'file') return 'Your resume.';
    if (it.source === 'bank') return 'From your saved answers.';
    return 'From your profile.';
  }

  // -> { need:[row], check:[row], done:[row], off:[row], req:{done,total}, opt:{done,total} }
  function classify(items, ctx) {
    ctx = ctx || {};
    const fieldOf = ctx.fieldOf || (() => null);
    const out = { need: [], check: [], done: [], off: [], req: { done: 0, total: 0 }, opt: { done: 0, total: 0 } };
    for (const it of items || []) {
      const f = fieldOf(it);
      if (!f || !f.el || !f.el.isConnected) continue;
      const has = C().hasValue(f);
      const v = has ? C().readValue(f) : '';
      const edited = (it.status === 'ai' || it.status === 'ok') && it.value && v && C().norm(v) !== C().norm(it.value) && !C().verify(f, it.value);
      const isEeo = ctx.isEeo ? ctx.isEeo(f) : false;
      let g;
      if (it.status === 'todo' || !it.status) {
        if (has) g = { group: 'done', reason: doneReason(it) };
        else if (it.off && !it.required) g = { group: 'off' };
        else if (!it.status && it.pendingAI) g = { group: 'need', reason: 'Waiting for local AI…' };
        else g = { group: 'need', reason: needReason(it, { isEeo, aiOff: !it.status && ctx.aiOff }) };
      } else if (edited) g = { group: 'done', reason: doneReason(it, true) };
      else if (it.status === 'ai' && !it.reviewed) g = { group: 'check', reason: checkReason(it) };
      else if (it.status === 'ok' && (it.guessed || it.weak) && !it.reviewed) g = { group: 'check', reason: checkReason(it) };
      else g = { group: 'done', reason: doneReason(it, false, isEeo) };
      const row = Object.assign({ it, f, value: v, private: ctx.isPrivate ? ctx.isPrivate(f) : isEeo, eeoRow: g.group === 'need' && isEeo && !it.required && !it.unstuck }, g);
      out[g.group].push(row);
      const bucket = it.required ? out.req : out.opt;
      if (g.group !== 'off') { bucket.total++; if (g.group !== 'need') bucket.done++; }
    }
    // optional self-identification questions are one calm row (they're the user's to answer, never a to-do list)
    const eeo = out.need.filter(r => r.eeoRow);
    if (eeo.length > 1) {
      out.need = out.need.filter(r => !r.eeoRow);
      out.need.push(Object.assign({}, eeo[0], { it: Object.assign({}, eeo[0].it, { label: `Voluntary self-identification (${eeo.length} questions)`, required: false }),
        reason: 'Optional. Only you answer these, here or once in Settings → Profile.', groupOf: eeo.length }));
    }
    const rank = r => (r.it.required ? 0 : r.eeoRow ? 2 : 1);
    out.need.sort((a, b) => rank(a) - rank(b));
    out.check.sort((a, b) => (b.it.flagged ? 1 : 0) - (a.it.flagged ? 1 : 0));
    return out;
  }

  // Scroll to the field and put keyboard focus in it (first option for radio groups, the visible button
  // for hidden file inputs).
  function focusTarget(f) {
    const vis = el => el && C().isVisible(el);
    if ((f.kind === 'radio' || f.kind === 'checkboxGroup' || f.kind === 'buttons') && f.options && f.options.length) {
      const o = f.options.find(x => x.el && x.el.checked) || f.options[0];
      return o.el || f.el;
    }
    if (f.kind === 'file' && !vis(f.el)) {
      const box = C().highlightTarget(f);
      const b = box && box.querySelector && Array.from(box.querySelectorAll('button, [role="button"], label, a')).find(vis);
      return b || f.el;
    }
    return f.el;
  }
  function goTo(f) {
    if (!f) return;
    C().flash(f);
    const t = focusTarget(f);
    setTimeout(() => { try { t.focus({ preventScroll: true }); } catch (_) { /* not focusable */ } }, 380);
  }

  function claimLine(reason) {
    if (!reason.claims) return [reason.text];
    const parts = ['Check this: '];
    reason.claims.slice(0, 3).forEach((c, i) => { if (i) parts.push(', '); parts.push(h('mark', { class: 'claim', text: trunc(c, 40) })); });
    parts.push(' ' + reason.text);
    return parts;
  }

  function row(r, group, hooks) {
    const it = r.it;
    const reasonNodes = typeof r.reason === 'string' ? [r.reason] : claimLine(r.reason || { text: '' });
    const reasonText = reasonNodes.map(n => (typeof n === 'string' ? n : n.textContent)).join('');
    const label = trunc(it.label || 'Untitled field', 70);
    const go = h('button', { class: 'tr-go', type: 'button', 'data-id': it.id,
      'aria-label': `${GROUPS[group].title}: ${label}${it.required ? ' (required)' : ''}. ${reasonText} Go to the field.`,
      onclick: () => goTo(r.f) },
    h('span', { class: 'tr-ic', 'aria-hidden': 'true', text: group === 'check' && it.status === 'ai' ? '✦' : GROUPS[group].icon }),
    h('span', { class: 'tr-tx' },
      h('span', { class: 'tr-l' }, label, it.required && group === 'need' ? h('span', { class: 'tr-req', text: 'Required' }) : null),
      h('span', { class: 'tr-r' }, reasonNodes)),
    h('span', { class: 'tr-go-ic', 'aria-hidden': 'true', text: '↗' }));
    const li = h('li', { class: 'tr ' + group, 'data-id': it.id }, go);
    if (group !== 'check') return li;
    const more = h('div', { class: 'tr-more' });
    if (r.value && !r.private) more.appendChild(h('div', { class: 'tr-v', title: r.value, text: '“' + trunc(r.value, 140) + '”' }));
    const src = (it.sources || []).slice(0, 2);
    if (it.status === 'ai' && src.length) {
      more.appendChild(h('div', { class: 'tr-src' }, h('span', { class: 'tr-src-h', text: 'Based on your resume' }), src.map(l => h('q', { text: trunc(l, 160) }))));
    } else if (it.status === 'ai' && it.essay) {
      more.appendChild(h('div', { class: 'tr-src none', text: 'No single resume line matches this answer closely. Read it carefully.' }));
    }
    const acts = h('div', { class: 'tr-acts' });
    const textual = it.status === 'ai' && r.f && (r.f.kind === 'textarea' || r.f.kind === 'text') && !(r.f.options && r.f.options.length);
    const status = h('span', { class: 'tr-st', role: 'status' });
    if (textual && hooks.rewrite) {
      const input = h('input', { type: 'text', class: 'tr-in', 'aria-label': `How should I rewrite “${label}”?`, placeholder: 'e.g. shorter, mention my SQL work', maxlength: '300' });
      const box = h('div', { class: 'tr-rw', hidden: true });
      const run = async () => {
        const ins = input.value.trim();
        if (!ins) { input.focus(); return; }
        box.querySelectorAll('button,input').forEach(b => { b.disabled = true; });
        status.textContent = 'Rewriting with your local AI…';
        try { await hooks.rewrite(it, r.f, ins); } finally { if (hooks.refresh) hooks.refresh(); }
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } if (e.key === 'Escape') { e.preventDefault(); box.hidden = true; open.focus(); } });
      box.append(input, h('button', { class: 'tr-btn pri', type: 'button', text: 'Rewrite', onclick: run }), h('button', { class: 'tr-btn', type: 'button', text: 'Cancel', onclick: () => { box.hidden = true; open.focus(); } }));
      const open = h('button', { class: 'tr-btn', type: 'button', 'aria-expanded': 'false', text: '✎ Rewrite with instruction', onclick: () => { box.hidden = !box.hidden; open.setAttribute('aria-expanded', String(!box.hidden)); if (!box.hidden) input.focus(); } });
      acts.appendChild(open);
      more.appendChild(acts); more.appendChild(box);
    } else more.appendChild(acts);
    if (hooks.fine) acts.appendChild(h('button', { class: 'tr-btn', type: 'button', 'aria-label': `Mark “${label}” as fine`, text: '✓ Mark as fine', onclick: () => hooks.fine(it, r.f) }));
    acts.appendChild(status);
    li.appendChild(more);
    return li;
  }

  function group(name, rows, hooks, open) {
    const G = GROUPS[name];
    const id = 'tg-' + name;
    const list = h('ul', { class: 'tr-list' }, rows.map(r => row(r, name, hooks)));
    const head = [h('span', { class: 'tg-ic', 'aria-hidden': 'true', text: G.icon }), h('span', { class: 'tg-t', id, text: G.title }), h('span', { class: 'tg-n', text: String(rows.length) })];
    if (name === 'done') {
      const d = h('details', { class: 'tg ' + name, 'data-group': name }, h('summary', { 'aria-label': `${G.title}, ${rows.length} field${rows.length === 1 ? '' : 's'}` }, head), list);
      d.open = !!open;
      return d;
    }
    return h('section', { class: 'tg ' + name, 'data-group': name, 'aria-labelledby': id }, h('div', { class: 'tg-h' }, head), list);
  }

  // The panel. ctx: { fieldOf, isEeo, isPrivate, aiOff, doneOpen }, hooks: { rewrite, fine, refresh }
  function render(items, ctx, hooks) {
    const t = classify(items, ctx);
    hooks = hooks || {};
    const box = h('div', { class: 'tri' });
    const parts = [`${t.need.length} need${t.need.length === 1 ? 's' : ''} you`, `${t.check.length} to check`, `${t.done.length} filled`];
    const prog = [t.req.total ? `Required ${t.req.done} of ${t.req.total}` : '', t.opt.total ? `Optional ${t.opt.done} of ${t.opt.total}` : ''].filter(Boolean).join(' · ');
    box.appendChild(h('div', { class: 'tri-sum', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
      h('span', { class: 'tri-counts', text: parts.join(' · ') }), prog ? h('span', { class: 'tri-prog', text: prog }) : null));
    if (!t.need.length && !t.check.length) box.appendChild(h('div', { class: 'tri-clear' }, h('span', { class: 'tg-ic', 'aria-hidden': 'true', text: '✓' }), 'Nothing left for you here. Look the page over, then press Submit yourself.'));
    if (t.need.length) box.appendChild(group('need', t.need, hooks));
    if (t.check.length) box.appendChild(group('check', t.check, hooks));
    if (t.done.length) box.appendChild(group('done', t.done, hooks, ctx && ctx.doneOpen));
    if (t.off.length) box.appendChild(h('div', { class: 'tri-off', text: `Not filled (turned off in Settings → Fields to fill): ${t.off.map(r => trunc(r.it.label, 40)).join(', ')}` }));
    // arrow keys move between rows; Home/End jump to the first/last
    box.addEventListener('keydown', e => {
      if (!/^(ArrowDown|ArrowUp|Home|End)$/.test(e.key) || !e.target.classList || !e.target.classList.contains('tr-go')) return;
      const all = Array.from(box.querySelectorAll('.tr-go')).filter(b => b.offsetParent !== null);
      const i = all.indexOf(e.target);
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : i + (e.key === 'ArrowDown' ? 1 : -1);
      if (all[n]) { e.preventDefault(); all[n].focus(); }
    });
    box.__counts = { need: t.need.length, check: t.check.length, done: t.done.length };
    return box;
  }

  JAA.triage = { classify, render, goTo, needReason, checkReason };
})();
